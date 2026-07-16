import type { OpenIncidentOption } from "./dispatcherFeedViews";

export const incidentClosedWhileEditingMessage =
  "Инцидент уже закрыт. Выберите другой.";

export type IncidentCloseSelectionState = {
  selectedIncident?: OpenIncidentOption;
  notice: string;
};

export type IncidentCloseSelectionAction =
  | {
      type: "select";
      incident: OpenIncidentOption;
    }
  | {
      type: "reset";
    }
  | {
      type: "feed_ready";
      openIncidents: readonly OpenIncidentOption[];
    }
  | {
      type: "feed_unavailable";
    };

export const initialIncidentCloseSelectionState: IncidentCloseSelectionState = {
  notice: "",
};

export function reduceIncidentCloseSelection(
  state: IncidentCloseSelectionState,
  action: IncidentCloseSelectionAction,
): IncidentCloseSelectionState {
  if (action.type === "select") {
    return {
      selectedIncident: action.incident,
      notice: "",
    };
  }

  if (action.type === "reset") {
    return initialIncidentCloseSelectionState;
  }

  if (action.type === "feed_unavailable") {
    return state;
  }

  if (state.selectedIncident === undefined) {
    return state;
  }

  const isStillOpen = action.openIncidents.some(
    (incident) =>
      incident.incidentNumber === state.selectedIncident?.incidentNumber,
  );

  return isStillOpen
    ? state
    : {
        notice: incidentClosedWhileEditingMessage,
      };
}
