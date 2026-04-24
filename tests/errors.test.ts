import { describe, test, expect } from "vitest";
import {
  HttpError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from "../shared/_core/errors";

describe("errors", () => {
  test("HttpError sets status code and message", () => {
    const err = new HttpError(500, "Internal Server Error");
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe("Internal Server Error");
    expect(err.name).toBe("HttpError");
  });

  test("BadRequestError creates 400 error", () => {
    const err = BadRequestError("Bad Request");
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe("Bad Request");
  });

  test("UnauthorizedError creates 401 error", () => {
    const err = UnauthorizedError("Unauthorized");
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("Unauthorized");
  });

  test("ForbiddenError creates 403 error", () => {
    const err = ForbiddenError("Forbidden");
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe("Forbidden");
  });

  test("NotFoundError creates 404 error", () => {
    const err = NotFoundError("Not Found");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Not Found");
  });
});
