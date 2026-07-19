"use client";

import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReviewReview {
  verificationStatus: string;
  assignedToId?: string | null;
  recommendation?: string | null;
  verifiedById?: string | null;
  verifiedAt?: Date | string | null;
  completedAt?: Date | string | null;
  assignee?: { id?: string; firstName?: string | null; lastName?: string | null; email?: string | null } | null;
  verifiedBy?: { id?: string; firstName?: string | null; lastName?: string | null; email?: string | null } | null;
}

function displayName(user: { firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined): string | null {
  if (!user) return null;
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || null;
}

interface ReviewProgressProps {
  registration: {
    status: string;
    reviewerId?: string | null;
    approvedAt?: Date | string | null;
    rejectedAt?: Date | string | null;
  };
  review: ReviewReview | null | undefined;
  isTwoStep: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StepDot({ color }: { color: "green" | "blue" | "gray" | "amber" }) {
  const colorMap = {
    green: "bg-success-500",
    blue: "bg-info-500",
    gray: "bg-neutral-300",
    amber: "bg-amber-500",
  };
  return (
    <div
      className={cn(
        "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-white text-xs font-bold",
        colorMap[color]
      )}
      aria-hidden="true"
    >
      {color === "green" ? "✓" : color === "blue" ? "●" : color === "amber" ? "●" : "●"}
    </div>
  );
}

function ConnectingLine({ color }: { color: "green" | "gray" }) {
  return (
    <div
      className={cn(
        "mx-1 h-0.5 flex-1",
        color === "green" ? "bg-success-400" : "bg-neutral-200"
      )}
      aria-hidden="true"
    />
  );
}

function recommendationBadgeTone(rec: string): "success" | "danger" | "warning" | "info" {
  switch (rec) {
    case "APPROVE":
      return "success";
    case "REJECT":
      return "danger";
    case "CORRECTION":
      return "warning";
    default:
      return "info";
  }
}

function recommendationLabel(rec: string): string {
  switch (rec) {
    case "APPROVE":
      return "Recommend Approve";
    case "REJECT":
      return "Recommend Reject";
    case "CORRECTION":
      return "Needs Correction";
    default:
      return rec;
  }
}

const FINAL_STATUSES = ["APPROVED", "REJECTED", "WAITLISTED", "CANCELLED", "CHECKED_IN", "COMPLETED", "ARCHIVED"];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReviewProgress({ registration, review, isTwoStep }: ReviewProgressProps) {
  if (!isTwoStep) return null;

  const verificationStatus = review?.verificationStatus ?? "NOT_STARTED";
  const isFinalDone = FINAL_STATUSES.includes(registration.status);

  // Step 1: Submission
  let step1Color: "green" | "blue" | "gray" | "amber" = "green";
  let step1Label = "Done";

  // Step 2: Verification
  let step2Color: "green" | "blue" | "gray" | "amber" = "gray";
  let step2Label = "Waiting";

  if (verificationStatus === "IN_PROGRESS") {
    step2Color = "blue";
    const assigneeName = review?.assignee
      ? `${review.assignee.firstName ?? ""} ${review.assignee.lastName ?? ""}`.trim() || review.assignee.email || "Assigned"
      : "Assigned";
    step2Label = assigneeName;
  } else if (verificationStatus === "COMPLETED") {
    step2Color = "green";
    step2Label = "Done";
  }

  // Step 3: Final Approval
  let step3Color: "green" | "blue" | "gray" | "amber" = "gray";
  let step3Label = "Locked";

  if (verificationStatus === "COMPLETED") {
    if (isFinalDone) {
      step3Color = "green";
      step3Label = registration.status === "APPROVED" ? "Approved" : registration.status === "REJECTED" ? "Rejected" : registration.status;
    } else {
      step3Color = "amber";
      step3Label = "Awaiting Decision";
    }
  }

  return (
    <div className="mb-6">
      <h3 className="mb-3 text-sm font-semibold text-neutral-900">Review Progress</h3>

      {/* Stepper */}
      <div className="flex items-start">
        {/* Step 1 */}
        <div className="flex flex-col items-center">
          <StepDot color={step1Color} />
          <span className="mt-1.5 text-xs font-medium text-neutral-700">Submission</span>
          <span className="text-xs text-neutral-400">{step1Label}</span>
        </div>

        <ConnectingLine color={step1Color === "green" ? "green" : "gray"} />

        {/* Step 2 */}
        <div className="flex flex-col items-center">
          <StepDot color={step2Color} />
          <span className="mt-1.5 text-xs font-medium text-neutral-700">Verification</span>
          <span className="text-xs text-neutral-400 whitespace-nowrap">
            {verificationStatus === "COMPLETED" && review?.recommendation ? (
              <Badge tone={recommendationBadgeTone(review.recommendation)}>
                {recommendationLabel(review.recommendation)}
              </Badge>
            ) : (
              step2Label
            )}
          </span>
        </div>

        <ConnectingLine color={step2Color === "green" ? "green" : "gray"} />

        {/* Step 3 */}
        <div className="flex flex-col items-center">
          <StepDot color={step3Color} />
          <span className="mt-1.5 text-xs font-medium text-neutral-700">Final Approval</span>
          <span className="text-xs text-neutral-400">{step3Label}</span>
        </div>
      </div>

      {/* Verification detail row */}
      {verificationStatus === "IN_PROGRESS" && review?.assignedToId && (
        <p className="mt-2 text-xs text-neutral-500 text-center">
          Verifier assigned — awaiting verification completion
        </p>
      )}
      {verificationStatus === "COMPLETED" && review?.verifiedAt && (
        <p className="mt-2 text-xs text-neutral-500 text-center">
          {review.recommendation === "APPROVE"
            ? `Recommended by ${displayName(review.verifiedBy) ?? "a campus rep"} on ${new Date(review.verifiedAt).toLocaleDateString()}`
            : `Verified on ${new Date(review.verifiedAt).toLocaleDateString()}`}
        </p>
      )}
    </div>
  );
}
