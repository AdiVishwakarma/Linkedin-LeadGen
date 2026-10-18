"""Rule-based lead classifier.

Deliberately transparent (no black-box model): every score is the sum of named signals, and the
signals that fired are returned so a reviewer can see WHY a post was scored the way it was.

Output:
  service_category  best-matching service (influencer_marketing, ad_agency, ...) or "other"
  intent_score      0-100  how much the author sounds like a BUYER (asking for / seeking a vendor)
  relevance_score   0-100  service match + India targeting + campaign keyword match
  intent_label      high | medium | low | not_a_lead
  is_india          True if the text carries India signals
  signals           human-readable list of what matched
"""

import re
from dataclasses import dataclass, field

# --------------------------------------------------------------------------------------
# Service categories: pattern -> weight. First pattern hit counts fully, extra hits add less.
# --------------------------------------------------------------------------------------
SERVICE_PATTERNS: dict[str, list[str]] = {
    "influencer_marketing": [
        r"influencer\s+marketing",
        r"influencer\s+agenc",
        r"influencer\s+(campaign|collab|management|partnership)",
        r"creator\s+(marketing|agenc|collab|partnership)",
        r"\binfluencers?\b",
        r"\bcreators?\b",
    ],
    "ad_agency": [
        r"advertising\s+agenc",
        r"\bad\s+agenc",
        r"\bad\s+film\s+agenc",
        r"media\s+(buying|planning)\s+agenc",
        r"performance\s+marketing\s+agenc",
        r"digital\s+marketing\s+agenc",
        r"marketing\s+agenc",
        r"creative\s+agenc",
        r"branding\s+agenc",
        r"\bbtl\b|\batl\b|\bbtl/atl\b",
        r"\bagency\b",
    ],
    "production_house": [
        r"production\s+house",
        r"production\s+compan",
        r"video\s+production",
        r"film\s+production",
        r"shoot\s+(crew|team)",
        r"post[-\s]?production",
        r"commercial\s+shoot",
        r"\bvideographer",
    ],
    "brand_film": [
        r"brand\s+film",
        r"corporate\s+(film|video)",
        r"\btvc\b",
        r"ad\s+film",
        r"documentary\s+(film|maker)",
        r"explainer\s+video",
        r"brand\s+video",
        r"\bfilm\s+makers?\b|\bfilmmakers?\b",
    ],
}

# Specific phrases beat generic words ("agency", "creators"), so weight by position in the list.
_SERVICE_BASE = 40.0   # first hit
_SERVICE_EXTRA = 10.0  # each additional distinct hit
_SERVICE_CAP = 60.0

# --------------------------------------------------------------------------------------
# Intent: BUYER signals (+) and SELLER / NOISE signals (-)
# --------------------------------------------------------------------------------------
POSITIVE_SIGNALS: list[tuple[str, str, int]] = [
    # (label, regex, weight)
    ("looking for", r"\b(we\s+are|we['’]re|i\s+am|i['’]m|am)?\s*looking\s+(for|to\s+(hire|work|partner|collaborate|engage))", 35),
    ("seeking / in search of", r"\b(seeking|in\s+search\s+of|searching\s+for|on\s+the\s+lookout)\b", 30),
    ("recommendation ask", r"\b(can|could|would)\s+(anyone|anybody|someone|you)\s+(please\s+)?(recommend|suggest|refer|connect|help)", 40),
    ("recommendation ask", r"\b(any|some)\s+(recommendations?|suggestions?|referrals?|leads?)\b", 30),
    ("recommend a/an", r"\brecommend\s+(a|an|any|some|good|the\s+best)\b", 30),
    ("who can help", r"\bwho\s+(can|could|would|does|do)\b.{0,40}\b(help|do|make|handle|shoot|run|manage)\b", 20),
    ("anyone know", r"\b(anyone|anybody|does\s+anyone)\s+(know|have\s+experience|worked\s+with|tried)\b", 30),
    ("need / require", r"\b(we|i)\s+(need|require|want)\s+(a|an|to\s+hire|to\s+work|some)\b", 30),
    ("need / require", r"\b(need|require)s?\s+(an?\s+|the\s+|some\s+)?(\w+[\s-]+){0,3}?(agency|agencies|production\s+(house|company)|influencers?|film\s?makers?|partner|vendor)", 30),
    ("hire an agency", r"\b(hire|hiring|engage|onboard|shortlist|finalis[ez]e)\s+(an?\s+|the\s+)?(good\s+|best\s+|new\s+)?(agency|production\s+house|influencer|film)", 35),
    ("RFP / pitch", r"\b(rfp|request\s+for\s+proposals?|pitch(es)?\s+(deck|invite)|agency\s+(pitch|search|empanel))", 35),
    ("vendor empanelment", r"\b(empanel+ment|vendor\s+(list|onboarding|search))\b", 25),
    ("dm / comment to connect", r"\b(dm\s+me|drop\s+(a\s+)?(comment|dm)|comment\s+below|reach\s+out\s+to\s+me|message\s+me|ping\s+me)\b", 12),
    ("budget mentioned", r"(\bbudget\b|₹|\brs\.?\s*\d|\binr\b|\b\d+\s*(lakh|lac|crore|cr|k)\b)", 12),
    ("urgency / timeline", r"\b(urgent(ly)?|asap|immediately|by\s+(next|this)\s+(week|month)|this\s+week|next\s+week|within\s+\d+\s+(days|weeks))\b", 10),
    ("question", r"\?", 8),
    # Hinglish
    ("hinglish ask", r"\b(koi|kisi\s+ko|kisiko)\b.{0,40}\b(pata|jaanta|jaante|hai\s+kya|suggest|recommend|bata|batao)", 30),
    ("hinglish need", r"\b(chahiye|zaroorat|zarurat|chaahiye)\b", 25),
    ("hinglish suggest", r"\b(suggest|recommend|refer)\s+(karo|kijiye|kariye|kar\s+do)\b", 30),
]

NEGATIVE_SIGNALS: list[tuple[str, str, int]] = [
    # Agencies advertising themselves
    ("self-promo: we offer / our services", r"\b(we\s+(offer|provide|specialise|specialize|help\s+(brands|businesses|you)|create|build|deliver)|our\s+(services|team|agency|work|portfolio|clients))\b", 40),
    ("self-promo: we are an agency", r"\b(we\s+are|we['’]re|i\s+am|i['’]m)\s+(a|an|the)\s+.{0,30}(agency|production\s+house|studio|company|filmmaker|freelancer)", 35),
    ("self-promo: call to action", r"\b(book\s+a\s+(call|demo)|dm\s+us|contact\s+us|get\s+in\s+touch|reach\s+out\s+to\s+us|visit\s+our|link\s+in\s+(bio|comments?)|free\s+(audit|consultation|demo))\b", 35),
    ("self-promo: case study / launch", r"\b(case\s+study|proud\s+to\s+(announce|share|have)|excited\s+to\s+(announce|share|launch|partner)|thrilled\s+to|just\s+(launched|wrapped|delivered)|we\s+delivered|campaign\s+(went\s+live|launched))\b", 35),
    ("congratulations / milestone", r"\b(congrat(s|ulations)|anniversary|milestone|work\s+anniversary|new\s+position|new\s+role|started\s+a\s+new)\b", 40),
    # Job posts (hiring an employee, not engaging an agency)
    ("job post", r"(#hiring|\bwe['’]re\s+hiring\b|\bwe\s+are\s+hiring\b|\bjob\s+(opening|opportunity|alert)|\bapply\s+(now|here|today)|\bjoin\s+our\s+team|\bopen\s+positions?\b|\bvacanc|\bwalk[-\s]?in|\bcv\s+to\b|\bsend\s+(your\s+)?(cv|resume)|\bfull[-\s]?time\s+(role|position)|\binternship\b|\bfresher)", 55),
    ("job seeker", r"\b(open\s+to\s+work|looking\s+for\s+(a\s+)?(job|opportunit|role|position|internship)|seeking\s+(a\s+)?(job|opportunit|role|position|internship)|available\s+for\s+(freelance|hire|projects))\b", 55),
    # Engagement bait / generic content
    ("engagement bait", r"\b(like\s+and\s+share|follow\s+(me|us)\s+for|tag\s+someone|agree\?|thoughts\?|webinar|masterclass|register\s+now|giveaway)\b", 25),
]

# --------------------------------------------------------------------------------------
# India targeting
# --------------------------------------------------------------------------------------
INDIA_TERMS = [
    "india", "indian", "bharat",
    "mumbai", "bombay", "delhi", "new delhi", "ncr", "gurgaon", "gurugram", "noida",
    "bengaluru", "bangalore", "hyderabad", "chennai", "kolkata", "pune", "ahmedabad",
    "jaipur", "surat", "lucknow", "chandigarh", "kochi", "cochin", "indore", "nagpur",
    "goa", "thane", "navi mumbai", "vadodara", "coimbatore", "bhopal", "patna",
]
_INDIA_RE = re.compile(
    r"(?<!\w)(" + "|".join(re.escape(t) for t in INDIA_TERMS) + r")(?!\w)|₹|\binr\b|\blakhs?\b|\blacs?\b|\bcrores?\b|\brs\.?\s*\d",
    re.IGNORECASE,
)
_INDIA_POINTS = 25.0

# Default intent label thresholds
HIGH_INTENT = 70
MEDIUM_INTENT = 40
NOT_A_LEAD_NEGATIVE = 45  # negative weight at/above this + weak positive => not a lead


@dataclass
class Classification:
    service_category: str = "other"
    service_scores: dict[str, float] = field(default_factory=dict)
    intent_score: float = 0.0
    relevance_score: float = 0.0
    intent_label: str = "low"
    is_india: bool = False
    signals: list[str] = field(default_factory=list)


def _compile(patterns: list[str]) -> list[re.Pattern]:
    return [re.compile(p, re.IGNORECASE) for p in patterns]


_SERVICE_RE = {k: _compile(v) for k, v in SERVICE_PATTERNS.items()}
_POS_RE = [(label, re.compile(rx, re.IGNORECASE), w) for label, rx, w in POSITIVE_SIGNALS]
_NEG_RE = [(label, re.compile(rx, re.IGNORECASE), w) for label, rx, w in NEGATIVE_SIGNALS]


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def classify(
    text: str,
    *,
    campaign_keywords: list[str] | None = None,
    exclude_keywords: list[str] | None = None,
    target_categories: list[str] | None = None,
) -> Classification:
    text = _clean(text)
    result = Classification()
    if not text:
        return result

    # ---- service category ----
    for category, patterns in _SERVICE_RE.items():
        hits = sum(1 for p in patterns if p.search(text))
        if hits:
            score = min(_SERVICE_CAP, _SERVICE_BASE + _SERVICE_EXTRA * (hits - 1))
            result.service_scores[category] = score
    if result.service_scores:
        result.service_category = max(result.service_scores, key=result.service_scores.get)
        result.signals.append(f"service: {result.service_category}")

    # ---- intent ----
    seen_labels: set[str] = set()
    positive = 0
    for label, rx, weight in _POS_RE:
        if label in seen_labels:  # same label can have several regexes; count it once
            continue
        if rx.search(text):
            seen_labels.add(label)
            positive += weight
            result.signals.append(f"+{weight} {label}")
    positive = min(100, positive)

    negative = 0
    seen_neg: set[str] = set()
    for label, rx, weight in _NEG_RE:
        if label in seen_neg:
            continue
        if rx.search(text):
            seen_neg.add(label)
            negative += weight
            result.signals.append(f"-{weight} {label}")

    # A buyer signal without any service mention is weak (could be about anything)
    if result.service_category == "other":
        positive = int(positive * 0.5)

    intent = max(0, min(100, positive - negative))
    result.intent_score = float(intent)

    if negative >= NOT_A_LEAD_NEGATIVE and positive < 70:
        result.intent_label = "not_a_lead"
    elif intent >= HIGH_INTENT:
        result.intent_label = "high"
    elif intent >= MEDIUM_INTENT:
        result.intent_label = "medium"
    else:
        result.intent_label = "low"

    # ---- India targeting ----
    result.is_india = bool(_INDIA_RE.search(text))
    if result.is_india:
        result.signals.append("india signal")

    # ---- relevance ----
    relevance = result.service_scores.get(result.service_category, 0.0)
    if result.is_india:
        relevance += _INDIA_POINTS
    lowered = text.lower()
    kw_hits = [k for k in (campaign_keywords or []) if k and k.lower() in lowered]
    if kw_hits:
        relevance += min(15.0, 5.0 * len(kw_hits))
        result.signals.append("campaign keywords: " + ", ".join(kw_hits[:5]))
    if target_categories and result.service_category in target_categories:
        relevance += 10.0
    excluded = [k for k in (exclude_keywords or []) if k and k.lower() in lowered]
    if excluded:
        relevance = max(0.0, relevance - 40.0)
        result.signals.append("excluded keywords: " + ", ".join(excluded[:5]))
    result.relevance_score = float(min(100.0, relevance))

    return result
