import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
import { FolderGit2, Plus, GitBranch, ArrowRight, Clock } from "lucide-react";
import { insertProjectSchema } from "@shared/schema";
import type { Project } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

const formSchema = insertProjectSchema.extend({
  name: z.string().min(1, "Name is required"),
  githubRepo: z.string().min(1, "Repository is required"),
});

export default function Projects() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      githubRepo: "",
      defaultBranch: "main",
      description: "",
    },
  });

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const createMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const res = await apiRequest("POST", "/api/projects", {
        ...values,
        description: values.description || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setOpen(false);
      form.reset();
      toast({ title: "Project created", description: "Your project has been created successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-page-subtitle">
            Manage your GitHub-connected projects
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-project">
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Project</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="my-awesome-project"
                          data-testid="input-project-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="githubRepo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GitHub Repository</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="owner/repo"
                          className="font-mono text-sm"
                          data-testid="input-github-repo"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultBranch"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Branch</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="main"
                          className="font-mono text-sm"
                          data-testid="input-default-branch"
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
                          placeholder="A brief description of this project"
                          data-testid="input-project-description"
                          className="resize-none"
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
                  disabled={createMutation.isPending}
                  data-testid="button-submit-project"
                >
                  {createMutation.isPending ? "Creating..." : "Create Project"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : !projects || projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderGit2 className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No projects yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first project to start managing changes
            </p>
            <Button onClick={() => setOpen(true)} data-testid="button-create-first-project">
              <Plus className="w-4 h-4 mr-2" />
              Create Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="hover-elevate cursor-pointer h-full" data-testid={`card-project-${project.id}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base font-medium truncate" data-testid={`text-project-name-${project.id}`}>{project.name}</CardTitle>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {project.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-project-desc-${project.id}`}>{project.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1 font-mono" data-testid={`text-project-repo-${project.id}`}>
                      <FolderGit2 className="w-3 h-3" />
                      {project.githubRepo}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1 font-mono" data-testid={`text-project-branch-${project.id}`}>
                      <GitBranch className="w-3 h-3" />
                      {project.defaultBranch}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
