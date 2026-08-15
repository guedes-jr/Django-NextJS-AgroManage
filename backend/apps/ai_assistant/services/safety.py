import re
from dataclasses import dataclass


EMERGENCY_PATTERNS = (
    r"dificuldade (?:para |de )?respirar", r"não consegue respirar", r"convuls",
    r"sangramento (?:forte|intenso)", r"mortalidade súbita", r"morreram? de repente",
    r"suspeita de intoxica", r"envenen", r"prolapso", r"distocia",
    r"não consegue (?:se )?levantar", r"incapaz de (?:se )?levantar",
)


@dataclass(frozen=True)
class LocalSafetyResult:
    emergency: bool
    matched_rules: tuple[str, ...]

    def to_dict(self):
        return {"emergency": self.emergency, "matched_rules": list(self.matched_rules)}


def classify_local_risk(text):
    normalized = (text or "").casefold()
    matches = tuple(pattern for pattern in EMERGENCY_PATTERNS if re.search(pattern, normalized))
    return LocalSafetyResult(bool(matches), matches)


def emergency_prefix():
    return (
        "⚠️ **Possível emergência veterinária:** procure atendimento de um médico-veterinário "
        "imediatamente. Evite medicar sem orientação e, se for seguro, mantenha o animal "
        "separado e em local calmo enquanto busca ajuda.\n\n"
    )
