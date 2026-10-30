/** Future review envelope only. No native IPC or agent route accepts this type in D14. */
export interface BrowserActionProposal {
  sessionId: string;
  origin: string;
  pageRevision: number;
  operation: "navigate" | "inspect" | "fill" | "click";
  elementRef: string | null;
  boundedArgument: string | null;
  classification: "READ" | "WRITE";
  consent: "SESSION_READ" | "PER_ACTION_APPROVAL";
  expectedResult: string;
}
