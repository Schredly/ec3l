export class CMDBError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CMDBError";
    this.code = code;
  }
}

export class CMDBInvariantViolation extends CMDBError {
  constructor(message: string) {
    super("CMDB_INVARIANT_VIOLATION", message);
    this.name = "CMDBInvariantViolation";
  }
}

export class CMDBNotFound extends CMDBError {
  constructor(message: string) {
    super("CMDB_NOT_FOUND", message);
    this.name = "CMDBNotFound";
  }
}

export class CMDBConflict extends CMDBError {
  constructor(message: string) {
    super("CMDB_CONFLICT", message);
    this.name = "CMDBConflict";
  }
}

export class CMDBAccessDenied extends CMDBError {
  constructor(message: string) {
    super("CMDB_ACCESS_DENIED", message);
    this.name = "CMDBAccessDenied";
  }
}
