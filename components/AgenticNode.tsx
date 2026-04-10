/**
 * AgenticNode - Composant de nœud agentique pulsant
 * Signature visuelle unique de NomosX Think Tank Agentique
 */

interface AgenticNodeProps {
  color?: "cyan" | "blue" | "emerald" | "purple";
  className?: string;
}

export default function AgenticNode({ color = "blue", className = "" }: AgenticNodeProps) {
  const colorMap = {
    cyan: "bg-indigo-400",
    blue: "bg-blue-400",
    emerald: "bg-emerald-400",
    purple: "bg-purple-400"
  };

  const baseColor = colorMap[color];
  const pulseColor = `${baseColor}/60`;

  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      {/* Nœud principal */}
      <div className={`w-1.5 h-1.5 rounded-full ${baseColor}`}></div>
      
      {/* Core pulsant (agent actif) */}
      <div className={`absolute top-0.5 left-0.5 w-0.5 h-0.5 rounded-full ${pulseColor} animate-pulse`}></div>
    </div>
  );
}
