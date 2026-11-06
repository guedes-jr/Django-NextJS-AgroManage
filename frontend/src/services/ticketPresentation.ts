import type { TranslationKey, TranslationValues } from "@/lib/localeMessages";

export function getTicketLabels(t: (key: TranslationKey, values?: TranslationValues) => string) {
  return {
    ticketStatuses: {
      open: t("workspace.open"),
      in_progress: t("workspace.inProgress"),
      waiting_customer: t("workspace.waitingForCustomer"),
      resolved: t("workspace.resolvedLabelLabel"),
      closed: t("workspace.closedLabelLabelLabel"),
    },
    ticketCategories: {
      access: t("workspace.access"),
      billing: t("settings.subscription.billing"),
      technical: t("workspace.technicalIssue"),
      question: t("workspace.question"),
      other: t("reproduction.other"),
    },
    ticketPriorities: {
      low: t("clinical.low"),
      normal: t("animalDetail.normal"),
      high: t("clinical.high"),
      urgent: t("notifications.priority.urgent"),
    },
  };
}
