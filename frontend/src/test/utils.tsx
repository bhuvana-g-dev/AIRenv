import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { configureAxe } from "vitest-axe";

/**
 * axe-core configured for jsdom. `color-contrast` is disabled because jsdom cannot compute
 * styles/layout; token contrast is checked separately in contrast.test.ts.
 */
export const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });

export function renderWithProviders(
  ui: ReactElement,
  { route = "/", ...options }: { route?: string } & Omit<RenderOptions, "wrapper"> = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return { client, ...render(ui, { wrapper: Wrapper, ...options }) };
}
