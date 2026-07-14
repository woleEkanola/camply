"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Input";
import { api } from "@/utils/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VerifierReview {
  id?: string;
  assignedToId?: string | null;
  verificationStatus?: string;
  recommendation?: string | null;
  reviewNotes?: string | null;
  verifiedById?: string | null;
  verifiedAt?: Date | string | null;
  assignedAt?: Date | string | null;
}

interface UserInfo {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

interface VerifierAssignmentProps {
  registration: {
    id: string;
  };
  review: VerifierReview | null | undefined;
  onRefresh: () => void;
  isTwoStep: boolean;
  organizationId: string;
  currentUserId: string;
  assignee?: UserInfo | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VerifierAssignment({
  registration,
  review,
  onRefresh,
  isTwoStep,
  organizationId,
  currentUserId,
  assignee,
}: VerifierAssignmentProps) {
  const [assigneeId, setAssigneeId] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [error, setError] = useState("");
  const [showChangePicker, setShowChangePicker] = useState(false);

  const utils = api.useUtils();

  const { data: users = [] } = api.user.getByOrganization.useQuery(
    { organizationId },
    { enabled: isTwoStep }
  );

  const assignMutation = api.registration.assignVerifier.useMutation({
    onSuccess: () => {
      setAssigneeId("");
      setShowChangePicker(false);
      setError("");
      onRefresh();
      utils.registration.getReview.invalidate({ registrationId: registration.id });
    },
    onError: (e) => setError(e.message),
  });

  const unassignMutation = api.registration.unassignVerifier.useMutation({
    onSuccess: () => {
      setShowChangePicker(false);
      setError("");
      onRefresh();
      utils.registration.getReview.invalidate({ registrationId: registration.id });
    },
    onError: (e) => setError(e.message),
  });

  const completeVerificationMutation = api.registration.completeVerification.useMutation({
    onSuccess: () => {
      setRecommendation("");
      setReviewNotes("");
      setError("");
      onRefresh();
      utils.registration.getReview.invalidate({ registrationId: registration.id });
    },
    onError: (e) => setError(e.message),
  });

  if (!isTwoStep) return null;

  const isAssigned = !!review?.assignedToId;
  const verificationStatus = review?.verificationStatus ?? "NOT_STARTED";
  const isVerifier = review?.assignedToId === currentUserId;

  const assigneeName = assignee
    ? `${assignee.firstName ?? ""} ${assignee.lastName ?? ""}`.trim() || assignee.email || "Unknown"
    : "None";

  const handleAssign = () => {
    if (!assigneeId) return;
    assignMutation.mutate({ registrationId: registration.id, assigneeId });
  };

  const handleUnassign = () => {
    unassignMutation.mutate({ registrationId: registration.id });
  };

  const handleCompleteVerification = () => {
    if (!recommendation) {
      setError("Please select a recommendation");
      return;
    }
    completeVerificationMutation.mutate({
      registrationId: registration.id,
      recommendation: recommendation as "APPROVE" | "REJECT" | "CORRECTION",
      reviewNotes: reviewNotes || undefined,
    });
  };

  return (
    <div className="mb-6">
      <Card>
        <CardHeader>
          <CardTitle>Verification</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {error && (
            <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>
          )}

          {/* Current verifier display */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-neutral-500">Verifier: </span>
              <span className="text-sm font-medium text-neutral-900">
                {isAssigned ? assigneeName : "Unassigned"}
              </span>
              {verificationStatus && (
                <Badge
                  tone={
                    verificationStatus === "COMPLETED"
                      ? "success"
                      : verificationStatus === "IN_PROGRESS"
                        ? "info"
                        : "neutral"
                  }
                  className="ml-2"
                >
                  {verificationStatus.replace(/_/g, " ")}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!showChangePicker && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowChangePicker(true)}
                >
                  {isAssigned ? "Change" : "Assign"}
                </Button>
              )}
              {isAssigned && (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={unassignMutation.isPending}
                  onClick={handleUnassign}
                >
                  Unassign
                </Button>
              )}
            </div>
          </div>

          {/* Verifier picker */}
          {showChangePicker && (
            <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 space-y-3">
              <Select
                label="Select verifier"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
              >
                <option value="">Choose a user…</option>
                {users.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} ({u.email})
                  </option>
                ))}
              </Select>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!assigneeId}
                  loading={assignMutation.isPending}
                  onClick={handleAssign}
                >
                  Assign
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowChangePicker(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Complete Verification (only for the assigned verifier) */}
          {isAssigned && isVerifier && verificationStatus === "IN_PROGRESS" && (
            <div className="border-t border-neutral-200 pt-4 space-y-3">
              <h4 className="text-sm font-semibold text-neutral-900">Complete Verification</h4>

              {/* Recommendation radio */}
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Recommendation
                </label>
                <div className="flex flex-wrap gap-4">
                  {(["APPROVE", "REJECT", "CORRECTION"] as const).map((rec) => (
                    <label key={rec} className="flex items-center gap-1.5 text-sm text-neutral-700 cursor-pointer">
                      <input
                        type="radio"
                        name="recommendation"
                        value={rec}
                        checked={recommendation === rec}
                        onChange={(e) => setRecommendation(e.target.value)}
                        className="text-accent-600 focus:ring-accent-500"
                      />
                      {rec === "APPROVE" ? "Approve" : rec === "REJECT" ? "Reject" : "Request Correction"}
                    </label>
                  ))}
                </div>
              </div>

              {/* Review Notes */}
              <Textarea
                label="Review Notes"
                placeholder="Internal notes about this recommendation…"
                rows={3}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
              />

              <Button
                size="sm"
                disabled={!recommendation}
                loading={completeVerificationMutation.isPending}
                onClick={handleCompleteVerification}
              >
                Submit Verification
              </Button>
            </div>
          )}

          {/* Completed verification read-only view */}
          {verificationStatus === "COMPLETED" && review?.recommendation && (
            <div className="border-t border-neutral-200 pt-4 space-y-2">
              <h4 className="text-sm font-semibold text-neutral-900">Verification Complete</h4>
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-500">Recommendation:</span>
                <Badge
                  tone={
                    review.recommendation === "APPROVE"
                      ? "success"
                      : review.recommendation === "REJECT"
                        ? "danger"
                        : "warning"
                  }
                >
                  {review.recommendation === "APPROVE"
                    ? "Approve"
                    : review.recommendation === "REJECT"
                      ? "Reject"
                      : "Needs Correction"}
                </Badge>
              </div>
              {review.reviewNotes && (
                <p className="text-sm text-neutral-600">
                  <span className="text-neutral-500">Notes: </span>
                  {review.reviewNotes}
                </p>
              )}
              {review.verifiedAt && (
                <p className="text-xs text-neutral-400">
                  Verified on {new Date(review.verifiedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* Assignment history placeholder - shown when record exists but no review yet */}
          {!isAssigned && verificationStatus === "NOT_STARTED" && (
            <p className="text-sm text-neutral-400">
              No verifier assigned. Use the button above to assign someone to verify this registration.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
