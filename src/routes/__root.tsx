import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "FlowCRM — Gestão de Tarefas para Equipes" },
      { name: "description", content: "CRM completo de tarefas com Kanban, automações e pagamentos." },
      { property: "og:title", content: "FlowCRM — Gestão de Tarefas para Equipes" },
      { property: "og:description", content: "CRM completo de tarefas com Kanban, automações e pagamentos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "FlowCRM — Gestão de Tarefas para Equipes" },
      { name: "twitter:description", content: "CRM completo de tarefas com Kanban, automações e pagamentos." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1aa36fee-f336-4947-bfda-cacb99bd0d77/id-preview-a75f009e--90cfccd1-7158-4295-9e9e-1753cbf102b0.lovable.app-1776730065049.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1aa36fee-f336-4947-bfda-cacb99bd0d77/id-preview-a75f009e--90cfccd1-7158-4295-9e9e-1753cbf102b0.lovable.app-1776730065049.png" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <Outlet />
      <Toaster richColors closeButton position="top-right" />
    </AuthProvider>
  );
}
