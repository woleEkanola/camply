"use client";

interface TimelineItemProps {
  title: string;
  time?: string;
  date?: string;
  status: string;
  participants?: string[];
}

export default function TimelineItem({
  title,
  time,
  date,
  status,
  participants,
}: TimelineItemProps) {
  const getStatusColor = () => {
    switch (status) {
      case "completed":
        return "bg-green-500";
      case "pending":
        return "bg-yellow-500";
      case "new":
        return "bg-blue-500";
      case "info":
        return "bg-indigo-500";
      case "dark":
        return "bg-gray-800";
      default:
        return "bg-gray-400";
    }
  };

  const getStatusBadge = () => {
    if (status === "new") {
      return (
        <span className="ml-2 rounded bg-blue-500 px-2 py-0.5 text-xs font-medium uppercase text-white">
          NEW
        </span>
      );
    }
    return null;
  };

  return (
    <div className="flex items-start space-x-3">
      <div className={`mt-1 h-3 w-3 flex-shrink-0 rounded-full ${getStatusColor()}`}></div>
      <div className="flex-1">
        <div className="flex items-center">
          <h4 className="text-sm font-medium text-gray-900">{title}</h4>
          {getStatusBadge()}
        </div>
        {(time || date) && (
          <p className="text-xs text-txt-secondary">
            {date && <span>{date}</span>}
            {date && time && <span>, at </span>}
            {time && <span className="font-medium">{time}</span>}
          </p>
        )}
        {participants && participants.length > 0 && (
          <div className="mt-2 flex -space-x-2">
            {participants.map((participant, index) => (
              <div
                key={index}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-300 text-xs font-medium text-white ring-2 ring-white"
              >
                {participant.charAt(0).toUpperCase()}
              </div>
            ))}
            {participants.length > 6 && (
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-txt-secondary ring-2 ring-white">
                +{participants.length - 6}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
