import { defineAgent, defineDynamic } from "eve";
import {
  opencodeGoContextWindowTokens,
  opencodeGoModel,
  opencodeGoModelId,
} from "./lib/opencode-go";

export default defineAgent({
  model: defineDynamic({
    events: {
      // step.started is the only resolver event allowed to return a
      // provider-authored LanguageModel, and it exposes ctx.session.id for the
      // x-opencode-session header.
      "step.started": (_event, ctx) => ({
        model: opencodeGoModel(opencodeGoModelId(), ctx.session.id),
        modelContextWindowTokens: opencodeGoContextWindowTokens(),
      }),
    },
  }),
});
