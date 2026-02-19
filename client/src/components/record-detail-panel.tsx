import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  User,
  Users,
  Timer,
  ArrowLeft,
  FileText,
  Activity,
  Workflow,
  Calendar,
  Hash,
  UserCircle,
  Clock,
  PlusCircle,
  UserCheck,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow, format } from "date-fns";
import { IntentStatusBadge } from "@/components/status-badge";
import type { RecordInstance, WorkflowExecutionIntent } from "@shared/schema";

type RecordInstanceWithSla = RecordInstance & {
  dueAt: string | null;
  slaStatus: string | null;
};

function AssignmentBadge({ assignedTo, assignedGroup }: { assignedTo: string | null; assignedGroup: string | null }) {
  if (assignedTo) {
    return (
      <Badge variant="outline" className="gap-1.5 text-xs py-1 px-2.5">
        <User className="w-3.5 h-3.5" />
        {assignedTo}
      </Badge>
    );
  }
  if (assignedGroup) {
    return (
      <Badge variant="secondary" className="gap-1.5 text-xs py-1 px-2.5">
        <Users className="w-3.5 h-3.5" />
        {assignedGroup}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1.5 text-xs py-1 px-2.5 text-muted-foreground">
      <UserCircle className="w-3.5 h-3.5" />
      Unassigned
    </Badge>
  );
}

function SlaBadgeLarge({ slaStatus, dueAt }: { slaStatus: string | null; dueAt: string | null }) {
  if (!slaStatus) {
    return (
      <Badge variant="outline" className="gap-1.5 text-xs py-1 px-2.5 text-muted-foreground">
        <Timer className="w-3.5 h-3.5" />
        No SLA
      </Badge>
    );
  }
  if (slaStatus === "breached") {
    return (
      <Badge variant="destructive" className="gap-1.5 text-xs py-1 px-2.5">
        <Timer className="w-3.5 h-3.5" />
        SLA Breached
        {dueAt && <span className="opacity-75 ml-1">{format(new Date(dueAt), "MMM d, HH:mm")}</span>}
      </Badge>
    );
  }
  return (
    <Badge className="gap-1.5 text-xs py-1 px-2.5 bg-green-600 hover:bg-green-700">
      <Timer className="w-3.5 h-3.5" />
      SLA Pending
      {dueAt && <span className="opacity-75 ml-1">{format(new Date(dueAt), "MMM d, HH:mm")}</span>}
    </Badge>
  );
}

function StatusIndicator({ slaStatus }: { slaStatus: string | null }) {
  if (slaStatus === "breached") {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
        <span className="text-xs text-muted-foreground">Breached</span>
      </div>
    );
  }
  if (slaStatus) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
        <span className="text-xs text-muted-foreground">SLA Active</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
      <span className="text-xs text-muted-foreground">Active</span>
    </div>
  );
}

function DetailField({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <div className="flex items-center justify-center w-7 h-7 rounded-md bg-muted text-muted-foreground flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}

function DetailsTab({ instance, recordTypeName }: { instance: RecordInstanceWithSla; recordTypeName: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0">
          <DetailField label="Record ID" icon={<Hash className="w-4 h-4" />}>
            <span className="font-mono text-xs bg-muted px-2 py-1 rounded">{instance.id}</span>
          </DetailField>

          <DetailField label="Record Type" icon={<FileText className="w-4 h-4" />}>
            {recordTypeName}
          </DetailField>

          <DetailField label="Assigned To" icon={<User className="w-4 h-4" />}>
            {instance.assignedTo || <span className="text-muted-foreground">Not assigned to individual</span>}
          </DetailField>

          <DetailField label="Assigned Group" icon={<Users className="w-4 h-4" />}>
            {instance.assignedGroup || <span className="text-muted-foreground">No group assignment</span>}
          </DetailField>

          <DetailField label="Created By" icon={<UserCircle className="w-4 h-4" />}>
            {instance.createdBy}
          </DetailField>

          <DetailField label="Created At" icon={<Calendar className="w-4 h-4" />}>
            {format(new Date(instance.createdAt), "MMM d, yyyy 'at' HH:mm:ss")}
          </DetailField>

          <DetailField label="SLA Due" icon={<Timer className="w-4 h-4" />}>
            {instance.dueAt
              ? format(new Date(instance.dueAt), "MMM d, yyyy 'at' HH:mm")
              : <span className="text-muted-foreground">No deadline</span>
            }
          </DetailField>

          <DetailField label="SLA Status" icon={<Clock className="w-4 h-4" />}>
            {instance.slaStatus === "breached" ? (
              <span className="text-destructive font-medium">Breached</span>
            ) : instance.slaStatus ? (
              <span className="text-green-600 font-medium">Pending</span>
            ) : (
              <span className="text-muted-foreground">No SLA configured</span>
            )}
          </DetailField>
        </div>
      </CardContent>
    </Card>
  );
}

type EventCategory = "record" | "assignment" | "sla" | "workflow" | "change";

const categoryMeta: Record<EventCategory, { color: string; label: string; variant: "secondary" | "outline" | "destructive" }> = {
  record:     { color: "bg-blue-500",   label: "record",     variant: "secondary" },
  assignment: { color: "bg-emerald-500", label: "assignment", variant: "outline" },
  sla:        { color: "bg-red-500",     label: "sla",        variant: "destructive" },
  workflow:   { color: "bg-violet-500",  label: "workflow",   variant: "outline" },
  change:     { color: "bg-amber-500",   label: "change",     variant: "outline" },
};

interface TimelineEvent {
  id: string;
  timestamp: string;
  title: string;
  detail: string | null;
  icon: React.ReactNode;
  category: EventCategory;
}

function buildTimelineFromInstance(instance: RecordInstanceWithSla): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    id: "rec-created",
    timestamp: instance.createdAt,
    title: "Record Created",
    detail: `Opened by ${instance.createdBy}`,
    icon: <PlusCircle className="w-3 h-3" />,
    category: "record",
  });

  events.push({
    id: "rec-type-set",
    timestamp: instance.createdAt,
    title: "Record Type Bound",
    detail: `Type ${instance.recordTypeId.slice(0, 8)}`,
    icon: <FileText className="w-3 h-3" />,
    category: "record",
  });

  if (instance.assignedTo) {
    events.push({
      id: "assign-user",
      timestamp: instance.createdAt,
      title: "Assigned to User",
      detail: instance.assignedTo,
      icon: <UserCheck className="w-3 h-3" />,
      category: "assignment",
    });
  }

  if (instance.assignedGroup) {
    events.push({
      id: "assign-group",
      timestamp: instance.createdAt,
      title: "Assigned to Group",
      detail: instance.assignedGroup,
      icon: <Users className="w-3 h-3" />,
      category: "assignment",
    });
  }

  if (!instance.assignedTo && !instance.assignedGroup) {
    events.push({
      id: "assign-none",
      timestamp: instance.createdAt,
      title: "Unassigned",
      detail: "No user or group assigned",
      icon: <UserCircle className="w-3 h-3" />,
      category: "assignment",
    });
  }

  if (instance.dueAt) {
    events.push({
      id: "sla-started",
      timestamp: instance.createdAt,
      title: "SLA Timer Started",
      detail: `Due ${format(new Date(instance.dueAt), "MMM d, HH:mm")}`,
      icon: <Timer className="w-3 h-3" />,
      category: "sla",
    });
  }

  if (instance.slaStatus === "breached" && instance.dueAt) {
    events.push({
      id: "sla-breached",
      timestamp: instance.dueAt,
      title: "SLA Breached",
      detail: "Timer deadline exceeded",
      icon: <AlertTriangle className="w-3 h-3" />,
      category: "sla",
    });
  }

  if (instance.slaStatus && instance.slaStatus !== "breached") {
    events.push({
      id: "sla-active",
      timestamp: instance.createdAt,
      title: "SLA Pending",
      detail: instance.dueAt ? `Deadline ${format(new Date(instance.dueAt), "MMM d, HH:mm")}` : "Timer running",
      icon: <Clock className="w-3 h-3" />,
      category: "sla",
    });
  }

  events.push({
    id: "wf-ready",
    timestamp: instance.createdAt,
    title: "Workflow Eligible",
    detail: "Record available for workflow triggers",
    icon: <Workflow className="w-3 h-3" />,
    category: "workflow",
  });

  events.push({
    id: "chg-track",
    timestamp: instance.createdAt,
    title: "Change Tracking Initialized",
    detail: "Record entered change pipeline",
    icon: <Activity className="w-3 h-3" />,
    category: "change",
  });

  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return events;
}

function ActivityTab({ instance }: { instance: RecordInstanceWithSla }) {
  const events = buildTimelineFromInstance(instance);

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-10">
          <Activity className="w-9 h-9 text-muted-foreground mb-2" />
          <p className="text-sm font-medium mb-1">No activity yet</p>
          <p className="text-xs text-muted-foreground">Events for this record will appear here</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-3 pb-1">
        <div className="space-y-0">
          {events.map((entry, idx) => {
            const meta = categoryMeta[entry.category];
            return (
              <div key={entry.id} className="flex gap-2 pb-2.5">
                <div className="flex flex-col items-center pt-0.5">
                  <div className={`w-2 h-2 rounded-full ${meta.color} flex-shrink-0`} />
                  {idx < events.length - 1 && <div className="w-px flex-1 bg-border mt-0.5" />}
                </div>
                <div className="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
                  <span className="text-muted-foreground flex-shrink-0">{entry.icon}</span>
                  <span className="text-xs font-medium leading-tight">{entry.title}</span>
                  <Badge variant={meta.variant} className="text-[9px] leading-none py-0 px-1.5 h-4">{meta.label}</Badge>
                  {entry.detail && (
                    <span className="text-[11px] text-muted-foreground leading-tight">{entry.detail}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground/60 ml-auto flex-shrink-0 tabular-nums">
                    {format(new Date(entry.timestamp), "MMM d HH:mm:ss")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

const workflowStatusMap: Record<string, { dot: string; line: string }> = {
  pending:   { dot: "bg-muted-foreground", line: "bg-border" },
  running:   { dot: "bg-blue-500",         line: "bg-blue-500/30" },
  completed: { dot: "bg-green-500",        line: "bg-green-500/30" },
  failed:    { dot: "bg-red-500",          line: "bg-red-500/30" },
};

const defaultStatusColors = { dot: "bg-muted-foreground", line: "bg-border" };

interface TraceNodeProps {
  dotColor: string;
  lineColor: string;
  isLast: boolean;
  name: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  intentId: string;
}

function WorkflowTraceNode({
  dotColor,
  lineColor,
  isLast,
  name,
  status,
  startedAt,
  completedAt,
  error,
  intentId,
}: TraceNodeProps) {
  return (
    <div className="flex gap-2.5">
      <div className="flex flex-col items-center">
        <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${dotColor}`} />
        {!isLast && <div className={`w-px flex-1 mt-0.5 ${lineColor}`} />}
      </div>
      <div className="flex-1 min-w-0 pb-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold font-mono leading-tight" title={name}>
            {name.length > 20 ? `${name.slice(0, 20)}…` : name}
          </span>
          <IntentStatusBadge status={status} />
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground tabular-nums">
          <span>Started {startedAt}</span>
          {completedAt && <span>Completed {completedAt}</span>}
        </div>
        {error && (
          <p className="text-[11px] text-destructive mt-0.5 leading-tight truncate" title={error}>
            {error}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground/50 mt-0.5 font-mono" title={intentId}>
          {intentId.slice(0, 12)}
        </p>
      </div>
    </div>
  );
}

function WorkflowTrace({ intents }: { intents: WorkflowExecutionIntent[] }) {
  const sorted = [...intents].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="space-y-0">
      {sorted.map((intent, idx) => {
        const colors = workflowStatusMap[intent.status] || defaultStatusColors;
        const startedAt = format(new Date(intent.createdAt), "MMM d HH:mm:ss");
        const completedAt = intent.status === "completed" ? startedAt : null;
        return (
          <WorkflowTraceNode
            key={intent.id}
            dotColor={colors.dot}
            lineColor={colors.line}
            isLast={idx === sorted.length - 1}
            name={intent.workflowDefinitionId}
            status={intent.status}
            startedAt={startedAt}
            completedAt={completedAt}
            error={intent.error}
            intentId={intent.id}
          />
        );
      })}
    </div>
  );
}

function WorkflowTab({ intents }: { intents: WorkflowExecutionIntent[] }) {
  if (intents.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-10">
          <Workflow className="w-9 h-9 text-muted-foreground mb-2" />
          <p className="text-sm font-medium mb-1">No workflow intents</p>
          <p className="text-xs text-muted-foreground">Workflow executions linked to this record will appear here</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-3 pb-1">
        <WorkflowTrace intents={intents} />
      </CardContent>
    </Card>
  );
}

interface RecordDetailPanelProps {
  instance: RecordInstanceWithSla;
  recordTypeName: string;
  onBack: () => void;
  workflowIntents?: WorkflowExecutionIntent[];
}

export function RecordDetailPanel({ instance, recordTypeName, onBack, workflowIntents = [] }: RecordDetailPanelProps) {
  return (
    <div className="space-y-4" data-testid={`record-detail-${instance.id}`}>
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="flex-shrink-0 mt-0.5"
          data-testid="button-back-records"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-0.5">
              <h2 className="text-lg font-semibold tracking-tight font-mono" data-testid="text-record-id">
                {instance.id.slice(0, 12)}...
              </h2>
              <p className="text-sm text-muted-foreground">
                {recordTypeName}
              </p>
            </div>
            <StatusIndicator slaStatus={instance.slaStatus} />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <AssignmentBadge assignedTo={instance.assignedTo} assignedGroup={instance.assignedGroup} />
            <SlaBadgeLarge slaStatus={instance.slaStatus} dueAt={instance.dueAt} />
            <Badge variant="outline" className="gap-1.5 text-xs py-1 px-2.5 text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              {formatDistanceToNow(new Date(instance.createdAt), { addSuffix: true })}
            </Badge>
          </div>
        </div>
      </div>

      <Separator />

      <Tabs defaultValue="details" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="details" className="gap-1.5" data-testid="tab-record-details">
            <FileText className="w-4 h-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5" data-testid="tab-record-activity">
            <Activity className="w-4 h-4" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="workflow" className="gap-1.5" data-testid="tab-record-workflow">
            <Workflow className="w-4 h-4" />
            Workflow
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-3">
          <DetailsTab instance={instance} recordTypeName={recordTypeName} />
        </TabsContent>

        <TabsContent value="activity" className="mt-3">
          <ActivityTab instance={instance} />
        </TabsContent>

        <TabsContent value="workflow" className="mt-3">
          <WorkflowTab intents={workflowIntents} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
