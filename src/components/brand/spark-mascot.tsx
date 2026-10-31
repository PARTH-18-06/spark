import { cn } from "@/lib/utils";

export type SparkMascotState =
  | "idle"
  | "thinking"
  | "encouraging"
  | "celebrating";

const stateLabels: Record<SparkMascotState, string> = {
  idle: "Spark is ready to learn",
  thinking: "Spark is thinking",
  encouraging: "Spark is cheering you on",
  celebrating: "Spark is celebrating",
};

export function SparkMascot({
  state = "idle",
  className,
  decorative = false,
}: {
  state?: SparkMascotState;
  className?: string;
  decorative?: boolean;
}) {
  const isThinking = state === "thinking";
  const isEncouraging = state === "encouraging";
  const isCelebrating = state === "celebrating";

  return (
    <svg
      viewBox="0 0 160 160"
      className={cn(`spark-${state}`, "overflow-visible", className)}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : stateLabels[state]}
    >
      {isCelebrating ? (
        <g className="spark-confetti" fill="none" strokeLinecap="round" strokeWidth="5">
          <path d="M27 33 17 23" stroke="#12a89a" />
          <path d="m132 32 10-10" stroke="#c84e56" />
          <path d="m30 74-15 2" stroke="#ffc94a" />
          <path d="m132 72 14 4" stroke="#12a89a" />
          <path d="M51 19 48 7" stroke="#c84e56" />
          <path d="m108 17 4-12" stroke="#ffc94a" />
        </g>
      ) : null}

      <g className="spark-body">
        <ellipse cx="82" cy="139" rx="42" ry="9" fill="#10263c" opacity="0.12" />
        <path
          className="spark-arm-left"
          d="M48 74c-13 4-19 14-21 25"
          fill="none"
          stroke="#10263c"
          strokeLinecap="round"
          strokeWidth="7"
        />
        <path
          className="spark-arm-right"
          d={isEncouraging || isCelebrating ? "M111 72c13-5 20-16 22-27" : "M111 75c13 5 18 15 19 25"}
          fill="none"
          stroke="#10263c"
          strokeLinecap="round"
          strokeWidth="7"
        />
        <circle cx="26" cy="101" r="6" fill="#12a89a" stroke="#10263c" strokeWidth="4" />
        <circle
          cx={isEncouraging || isCelebrating ? 135 : 131}
          cy={isEncouraging || isCelebrating ? 42 : 102}
          r="6"
          fill="#12a89a"
          stroke="#10263c"
          strokeWidth="4"
        />
        <path
          className="spark-bolt"
          d="M91 13 46 76h29l-8 68 48-78H87l4-53Z"
          fill="#ffc94a"
          stroke="#10263c"
          strokeLinejoin="round"
          strokeWidth="7"
        />
        {isCelebrating ? (
          <g fill="none" stroke="#10263c" strokeLinecap="round" strokeWidth="4.5">
            <path d="M65 69q6-7 12 0" />
            <path d="M89 69q6-7 12 0" />
          </g>
        ) : (
          <g fill="#10263c">
            <ellipse cx={isThinking ? 69 : 71} cy="69" rx="4.5" ry="6" />
            <ellipse cx={isThinking ? 93 : 95} cy="69" rx="4.5" ry="6" />
          </g>
        )}
        <path
          d={isThinking ? "M76 88q8-4 15 0" : isCelebrating ? "M72 86q12 17 25 0Z" : "M72 84q12 13 25 0"}
          fill={isCelebrating ? "#fffdf7" : "none"}
          stroke="#10263c"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4.5"
        />
        <circle cx="61" cy="80" r="5" fill="#f08b72" opacity="0.52" />
        <circle cx="105" cy="80" r="5" fill="#f08b72" opacity="0.52" />
      </g>

      {isThinking ? (
        <g fill="#fffdf7" stroke="#10263c" strokeWidth="3">
          <circle cx="119" cy="37" r="4" />
          <circle cx="130" cy="27" r="6" />
          <circle cx="144" cy="13" r="9" />
        </g>
      ) : null}

      {isEncouraging ? (
        <path
          d="M139 26c5-9 18-1 9 7l-9 8-9-8c-9-8 4-16 9-7Z"
          fill="#f08b72"
          stroke="#10263c"
          strokeLinejoin="round"
          strokeWidth="3"
        />
      ) : null}
    </svg>
  );
}
