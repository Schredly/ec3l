import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileCode2, Terminal as TerminalIcon, SearchCheck, Bot } from "lucide-react";

const skills = [
  {
    name: "editFile",
    description: "Edit a file in the workspace at a specific path with new content. Supports creating new files and modifying existing ones.",
    icon: FileCode2,
    category: "File Operations",
    inputs: ["filePath", "content"],
    outputs: ["success", "diff"],
  },
  {
    name: "runCommand",
    description: "Execute a shell command inside the workspace environment. Captures stdout, stderr, and exit code.",
    icon: TerminalIcon,
    category: "Execution",
    inputs: ["command", "cwd"],
    outputs: ["stdout", "stderr", "exitCode"],
  },
  {
    name: "runLint",
    description: "Run the project linter against the workspace. Detects code quality issues and returns structured results.",
    icon: SearchCheck,
    category: "Validation",
    inputs: ["modulePath"],
    outputs: ["passed", "errors", "warnings"],
  },
];

export default function Skills() {
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agent Skills</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Available skills for the agentic execution engine
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3 mb-3">
            <Bot className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-medium">How it works</p>
              <p className="text-xs text-muted-foreground">
                The agent accepts an intent, selects appropriate skills, executes them sequentially,
                and marks the change as Ready when validation passes.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {skills.map((skill) => (
          <Card key={skill.name} data-testid={`card-skill-${skill.name}`}>
            <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
              <div className="p-2 rounded-md bg-muted">
                <skill.icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-sm font-mono">{skill.name}</CardTitle>
                <Badge variant="secondary" className="mt-1">{skill.category}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{skill.description}</p>
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Inputs</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {skill.inputs.map((input) => (
                      <span key={input} className="text-xs px-2 py-0.5 rounded-md bg-muted font-mono">
                        {input}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Outputs</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {skill.outputs.map((output) => (
                      <span key={output} className="text-xs px-2 py-0.5 rounded-md bg-muted font-mono">
                        {output}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
