import { createFileRoute, redirect } from "@tanstack/react-router";

// O calendário foi integrado à página de Tarefas (toggle Kanban/Lista/Calendário).
// Este arquivo existe apenas para compatibilidade com o routeTree gerado anteriormente.
export const Route = createFileRoute("/_app/calendar")({
  beforeLoad: () => {
    throw redirect({ to: "/tasks" });
  },
  component: () => null,
});
