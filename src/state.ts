import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const AssignmentSchema = z.object({
  approved: z.boolean(),
  labels: z.record(z.string(), z.string()),
  caps: z.array(z.string()),
  approvedAt: z.string().optional(),
});

export type Assignment = z.infer<typeof AssignmentSchema>;

const DEFAULT_ASSIGNMENT: Assignment = {
  approved: false,
  labels: {},
  caps: [],
};

const ASSIGNMENT_PATH = path.join(process.cwd(), "data", "assignment.json");

export function assignmentPath(): string {
  return ASSIGNMENT_PATH;
}

export async function loadAssignment(filePath: string = ASSIGNMENT_PATH): Promise<Assignment> {
  try {
    const raw = await readFile(filePath, "utf8");
    return AssignmentSchema.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ...DEFAULT_ASSIGNMENT };
    }
    throw err;
  }
}

export async function saveAssignment(
  assignment: Assignment,
  filePath: string = ASSIGNMENT_PATH,
): Promise<void> {
  const validated = AssignmentSchema.parse(assignment);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
}
