import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChangeStatusBadge } from "@/components/status-badge";
import {
  FolderGit2,
  GitBranch,
  Plus,
  ArrowLeft,
  Clock,
  GitPullRequestArrow,
} from "lucide-react";
import { insertChangeRecordSchema } from "@shared/schema";
import type { Project, ChangeRecord } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

const changeFormSchema = insertChangeRecordSchema.extend({
  title: z.string().min(1, "Title is required"),
}).omit({ projectId: true });

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const form = useForm<z.infer<typeof changeFormSchema>>({
    resolver: zodResolver(changeFormSchema),
    defaultValues: {
      title: "",
      description: "",
      baseSha: "",
      modulePath: "",
    },
  });

  const { data: project, isLoading: loadingProject } = useQuery<Project>({
    queryKey: ["/api/projects", id],
  });

  const { data: changes, isLoading: loadingChanges } = useQuery<ChangeRecord[]>({
    queryKey: ["/api/projects", id, "changes"],
  });

  const createChangeMutation = useMutation({
    mutationFn: async (values: z.infer<typeof changeFormSchema>) => {
      const res = await apiRequest("POST", "/api/changes", {
        projectId: id,
        title: values.title,
        description: values.description || undefined,
        baseSha: values.baseSha || undefined,
        modulePath: values.modulePath || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "changes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/changes"] });
      setOpen(false);
      form.reset();
      toast({ title: "Change created", description: "Your change record has been created." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (loadingProject) {
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <p className="text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/projects">
          <Button variant="ghost" size="icon" data-testid="button-back-projects">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight truncate" data-testid="text-project-name">{project.name}</h1>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1 font-mono" data-testid="text-project-repo">
              <FolderGit2 className="w-3 h-3" />
              {project.githubRepo}
            </span>
            <span className="flex items-center gap-1 font-mono" data-testid="text-project-branch">
              <GitBranch className="w-3 h-3" />
              {project.defaultBranch}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Created {formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>

      {project.description && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground" data-testid="text-project-description">{project.description}</p>
          </CardContent>
        </Card>
      )}

      <Separator />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-lg font-medium">Change Records</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-change">
              <Plus className="w-4 h-4 mr-2" />
              New Change
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Change Record</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((values) => createChangeMutation.mutate(values))}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Fix authentication bug"
                          data-testid="input-change-title"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe the change"
                          data-testid="input-change-description"
                          className="resize-none"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="baseSha"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base SHA (optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="abc123..."
                          className="font-mono text-sm"
                          data-testid="input-base-sha"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="modulePath"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Module Path (optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="src/auth"
                          className="font-mono text-sm"
                          data-testid="input-module-path"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createChangeMutation.isPending}
                  data-testid="button-submit-change"
                >
                  {createChangeMutation.isPending ? "Creating..." : "Create Change"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {loadingChanges ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !changes || changes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <GitPullRequestArrow className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-1">No changes yet</p>
            <p className="text-xs text-muted-foreground">Create your first change record</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {changes.map((change) => (
            <Link key={change.id} href={`/changes/${change.id}`}>
              <Card className="hover-elevate cursor-pointer" data-testid={`card-change-${change.id}`}>
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" data-testid={`text-change-title-${change.id}`}>{change.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      {change.modulePath && (
                        <span className="font-mono">{change.modulePath}</span>
                      )}
                      {change.branchName && (
                        <span className="flex items-center gap-1 font-mono">
                          <GitBranch className="w-3 h-3" />
                          {change.branchName}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(change.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <ChangeStatusBadge status={change.status} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
