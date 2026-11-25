import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInWithEmail, signInWithGoogle } from "../lib/auth";
import { axe } from "../test/utils";
import SignIn from "./SignIn";

vi.mock("../lib/auth", () => ({ signInWithEmail: vi.fn(), signInWithGoogle: vi.fn() }));

describe("SignIn page", () => {
  beforeEach(() => {
    vi.mocked(signInWithEmail).mockResolvedValue(undefined);
    vi.mocked(signInWithGoogle).mockResolvedValue(undefined);
  });

  it("is accessible with labelled, required fields and a page title", async () => {
    const { container } = render(<SignIn />);
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeRequired();
    expect(screen.getByLabelText(/^Password/)).toBeRequired();
    expect(document.title).toBe("Sign in · AIRenv");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("submits email credentials", async () => {
    const user = userEvent.setup();
    render(<SignIn />);
    await user.type(screen.getByLabelText("Email"), "a@b.org");
    await user.type(screen.getByLabelText(/^Password/), "s3cret-pass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(signInWithEmail).toHaveBeenCalledWith("a@b.org", "s3cret-pass", false);
  });

  it("announces errors and links them to the inputs", async () => {
    vi.mocked(signInWithEmail).mockRejectedValue(new Error("Firebase: Wrong password (auth/wrong-password)."));
    const user = userEvent.setup();
    render(<SignIn />);
    await user.type(screen.getByLabelText("Email"), "a@b.org");
    await user.type(screen.getByLabelText(/^Password/), "wrong-pass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Wrong password (auth/wrong-password).");
    expect(screen.getByLabelText(/^Password/)).toHaveAccessibleDescription(/wrong password/i);
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("switches to account creation", async () => {
    const user = userEvent.setup();
    render(<SignIn />);
    await user.click(screen.getByRole("button", { name: /create an account/i }));
    expect(screen.getByRole("heading", { level: 1, name: "Create your account" })).toBeInTheDocument();
    expect(document.title).toBe("Create account · AIRenv");
  });
});
