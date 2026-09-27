import { assertEquals } from "@std/assert";
import { checkInternalAuth, INTERNAL_AUTH_HEADER } from "./internal-auth.ts";

function withEnv(value: string | undefined, fn: () => void) {
  const previous = Deno.env.get("INTERNAL_API_SECRET");
  if (value === undefined) {
    Deno.env.delete("INTERNAL_API_SECRET");
  } else {
    Deno.env.set("INTERNAL_API_SECRET", value);
  }
  try {
    fn();
  } finally {
    if (previous === undefined) Deno.env.delete("INTERNAL_API_SECRET");
    else Deno.env.set("INTERNAL_API_SECRET", previous);
  }
}

Deno.test("rejects with 500 when INTERNAL_API_SECRET is not configured at all", () => {
  withEnv(undefined, () => {
    const req = new Request("http://localhost/", {
      headers: { [INTERNAL_AUTH_HEADER]: "anything" },
    });
    const result = checkInternalAuth(req);
    assertEquals(result?.status, 500);
  });
});

Deno.test("rejects with 401 when the header is missing", () => {
  withEnv("correct-secret", () => {
    const req = new Request("http://localhost/");
    const result = checkInternalAuth(req);
    assertEquals(result?.status, 401);
  });
});

Deno.test("rejects with 401 when the header value doesn't match", () => {
  withEnv("correct-secret", () => {
    const req = new Request("http://localhost/", {
      headers: { [INTERNAL_AUTH_HEADER]: "wrong-secret" },
    });
    const result = checkInternalAuth(req);
    assertEquals(result?.status, 401);
  });
});

Deno.test("allows the request through (returns null) when the header matches", () => {
  withEnv("correct-secret", () => {
    const req = new Request("http://localhost/", {
      headers: { [INTERNAL_AUTH_HEADER]: "correct-secret" },
    });
    const result = checkInternalAuth(req);
    assertEquals(result, null);
  });
});
