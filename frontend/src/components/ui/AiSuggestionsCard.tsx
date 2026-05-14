"use client";

interface AiSuggestion {
  text: string;
}

interface AiSuggestionsCardProps {
  suggestions: AiSuggestion[];
  title?: string;
  badge?: string;
  emptyText?: string;
}

export function AiSuggestionsCard({
  suggestions,
  title = "Assistente IA",
  badge = "Beta",
  emptyText = "Nenhuma sugestão no momento",
}: AiSuggestionsCardProps) {
  return (
    <div className="repro-ai-card h-100">
      <div className="repro-ai-header">
        <span>🤖</span>
        <span>{title}</span>
        {badge && <span className="repro-ai-badge">{badge}</span>}
      </div>
      {suggestions.length === 0 ? (
        <div
          style={{
            fontSize: "0.8rem",
            opacity: 0.5,
            textAlign: "center",
            padding: "1rem",
          }}
        >
          {emptyText}
        </div>
      ) : (
        suggestions.map((s, i) => (
          <div key={i} className="repro-ai-suggestion">
            {s.text}
          </div>
        ))
      )}
    </div>
  );
}
