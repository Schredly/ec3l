import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Asterisk,
  Check,
  Loader2,
  Wand2,
  Save,
  Zap,
  FileText,
} from "lucide-react";

interface RecordType {
  id: string;
  name: string;
  description?: string;
  version?: number;
}

interface FormDefinition {
  id: string;
  name: string;
  recordTypeId: string;
  version?: number;
  status?: string;
}

interface FieldEffective {
  required: boolean;
  readOnly: boolean;
  visible: boolean;
}

interface CompiledField {
  id: string;
  name: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  defaultValue?: unknown;
  effective: FieldEffective;
  choices?: { value: string; label: string }[];
  referenceRecordTypeId?: string;
}

interface Placement {
  fieldDefinitionId: string;
  column: number;
  orderIndex: number;
  field: CompiledField;
}

interface Section {
  id: string;
  title: string;
  orderIndex: number;
  placements: Placement[];
}

interface CompiledForm {
  recordType: { id: string; name: string; description?: string; version?: number };
  formDefinition: { id: string; name: string; version?: number; status?: string };
  sections: Section[];
  behaviorRules: unknown[];
  fields: Record<string, CompiledField>;
  overridesApplied: number;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

interface FormPatchOp {
  type: "moveField" | "changeSection" | "toggleRequired" | "toggleReadOnly" | "toggleVisible";
  payload: Record<string, unknown>;
}

export default function FormStudio() {
  const { toast } = useToast();

  const [selectedRecordType, setSelectedRecordType] = useState<string>("");
  const [selectedFormName, setSelectedFormName] = useState<string>("");
  const [originalForm, setOriginalForm] = useState<CompiledForm | null>(null);
  const [workingCopy, setWorkingCopy] = useState<CompiledForm | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const [pendingOperations, setPendingOperations] = useState<FormPatchOp[]>([]);
  const [changeSummary, setChangeSummary] = useState("");
  const [saveResult, setSaveResult] = useState<{ overrideId: string; changeId: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  const [vibeDescription, setVibeDescription] = useState("");
  const [vibePatchResult, setVibePatchResult] = useState<Record<string, unknown> | null>(null);
  const [isGeneratingVibe, setIsGeneratingVibe] = useState(false);
  const [isSavingVibe, setIsSavingVibe] = useState(false);

  const { data: recordTypes, isLoading: loadingRecordTypes } = useQuery<RecordType[]>({
    queryKey: ["/api/record-types"],
  });

  const { data: formDefinitions, isLoading: loadingFormDefs } = useQuery<FormDefinition[]>({
    queryKey: ["/api/form-definitions"],
  });

  const filteredFormDefs = useMemo(() => {
    if (!formDefinitions || !selectedRecordType || !recordTypes) return [];
    const rt = recordTypes.find((r) => r.name === selectedRecordType);
    if (!rt) return [];
    return formDefinitions.filter((fd) => fd.recordTypeId === rt.id);
  }, [formDefinitions, selectedRecordType, recordTypes]);

  const {
    data: compiledForm,
    isLoading: loadingCompiled,
    refetch: refetchCompiled,
  } = useQuery<CompiledForm>({
    queryKey: ["/api/forms", selectedRecordType, selectedFormName, "compiled"],
    enabled: false,
  });

  useEffect(() => {
    if (compiledForm) {
      setOriginalForm(deepClone(compiledForm));
      setWorkingCopy(deepClone(compiledForm));
      setSelectedFieldId(null);
      setSaveResult(null);
      setPendingOperations([]);
    }
  }, [compiledForm]);

  const handleFetchForm = useCallback(() => {
    if (selectedRecordType && selectedFormName) {
      refetchCompiled();
    }
  }, [selectedRecordType, selectedFormName, refetchCompiled]);

  useEffect(() => {
    setSelectedFormName("");
    setOriginalForm(null);
    setWorkingCopy(null);
    setSelectedFieldId(null);
    setSaveResult(null);
    setPendingOperations([]);
  }, [selectedRecordType]);

  const selectedField = useMemo(() => {
    if (!workingCopy || !selectedFieldId) return null;
    return workingCopy.fields[selectedFieldId] || null;
  }, [workingCopy, selectedFieldId]);

  const selectedFieldPlacement = useMemo(() => {
    if (!workingCopy || !selectedFieldId) return null;
    for (const section of workingCopy.sections) {
      const idx = section.placements.findIndex((p) => p.fieldDefinitionId === selectedFieldId);
      if (idx !== -1) return { section, placementIndex: idx };
    }
    return null;
  }, [workingCopy, selectedFieldId]);

  const updateFieldEffective = useCallback(
    (fieldId: string, key: keyof FieldEffective, value: boolean) => {
      if (!workingCopy) return;
      const updated = deepClone(workingCopy);
      if (updated.fields[fieldId]) {
        updated.fields[fieldId].effective[key] = value;
      }
      for (const section of updated.sections) {
        for (const placement of section.placements) {
          if (placement.fieldDefinitionId === fieldId && placement.field) {
            placement.field.effective[key] = value;
          }
        }
      }
      setWorkingCopy(updated);

      const opTypeMap: Record<keyof FieldEffective, FormPatchOp["type"]> = {
        required: "toggleRequired",
        readOnly: "toggleReadOnly",
        visible: "toggleVisible",
      };
      setPendingOperations((prev) => [
        ...prev,
        { type: opTypeMap[key], payload: { targetFieldId: fieldId, value } },
      ]);
    },
    [workingCopy]
  );

  const moveField = useCallback(
    (direction: "up" | "down") => {
      if (!workingCopy || !selectedFieldPlacement || !selectedFieldId) return;
      const updated = deepClone(workingCopy);
      const section = updated.sections.find((s) => s.id === selectedFieldPlacement.section.id);
      if (!section) return;
      const idx = selectedFieldPlacement.placementIndex;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= section.placements.length) return;
      const temp = section.placements[idx];
      section.placements[idx] = section.placements[newIdx];
      section.placements[newIdx] = temp;
      section.placements.forEach((p, i) => (p.orderIndex = i));
      setWorkingCopy(updated);

      setPendingOperations((prev) => [
        ...prev,
        {
          type: "moveField",
          payload: {
            targetFieldId: selectedFieldId,
            sectionId: selectedFieldPlacement.section.id,
            orderIndex: newIdx,
          },
        },
      ]);
    },
    [workingCopy, selectedFieldPlacement, selectedFieldId]
  );

  const moveToSection = useCallback(
    (targetSectionId: string) => {
      if (!workingCopy || !selectedFieldId || !selectedFieldPlacement) return;
      if (targetSectionId === selectedFieldPlacement.section.id) return;
      const updated = deepClone(workingCopy);
      const sourceSection = updated.sections.find((s) => s.id === selectedFieldPlacement.section.id);
      const targetSection = updated.sections.find((s) => s.id === targetSectionId);
      if (!sourceSection || !targetSection) return;
      const [placement] = sourceSection.placements.splice(selectedFieldPlacement.placementIndex, 1);
      targetSection.placements.push(placement);
      sourceSection.placements.forEach((p, i) => (p.orderIndex = i));
      targetSection.placements.forEach((p, i) => (p.orderIndex = i));
      setWorkingCopy(updated);

      setPendingOperations((prev) => [
        ...prev,
        {
          type: "changeSection",
          payload: {
            targetFieldId: selectedFieldId,
            fromSectionId: selectedFieldPlacement.section.id,
            toSectionId: targetSectionId,
            orderIndex: targetSection.placements.length - 1,
          },
        },
      ]);
    },
    [workingCopy, selectedFieldId, selectedFieldPlacement]
  );

  const handleSaveOverride = useCallback(async () => {
    if (!selectedRecordType || !selectedFormName) return;
    if (pendingOperations.length === 0) {
      toast({ title: "No changes", description: "Make some edits before saving.", variant: "destructive" });
      return;
    }
    if (!changeSummary.trim()) {
      toast({ title: "Change summary required", description: "Please enter a description of your changes.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const res = await apiRequest("POST", `/api/forms/${selectedRecordType}/${selectedFormName}/overrides`, {
        changeSummary: changeSummary.trim(),
        operations: pendingOperations,
      });
      const data = await res.json();
      setSaveResult({ overrideId: data.overrideId || data.id, changeId: data.changeId });
      setPendingOperations([]);
      toast({ title: "Override saved", description: `Override ${data.overrideId || data.id} created successfully.` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save override";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [selectedRecordType, selectedFormName, pendingOperations, changeSummary, toast]);

  const handleActivateOverride = useCallback(async () => {
    if (!saveResult) return;
    setIsActivating(true);
    try {
      await apiRequest("POST", `/api/changes/${saveResult.changeId}/status`, { status: "Ready" });
      await apiRequest("POST", `/api/overrides/${saveResult.overrideId}/activate`);
      toast({ title: "Override activated", description: "The override is now active." });
      queryClient.invalidateQueries({ queryKey: ["/api/forms", selectedRecordType, selectedFormName, "compiled"] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to activate override";
      toast({ title: "Activation failed", description: message, variant: "destructive" });
    } finally {
      setIsActivating(false);
    }
  }, [saveResult, selectedRecordType, selectedFormName, toast]);

  const handleVibeGenerate = useCallback(async () => {
    if (!selectedRecordType || !selectedFormName || !vibeDescription.trim()) return;
    setIsGeneratingVibe(true);
    setVibePatchResult(null);
    try {
      const res = await apiRequest("POST", `/api/forms/${selectedRecordType}/${selectedFormName}/vibePatch`, {
        description: vibeDescription.trim(),
      });
      const data = await res.json();
      setVibePatchResult(data);
      toast({ title: "Vibe patch generated", description: `${data.operations?.length || 0} operation(s) generated. Review below.` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to generate vibe patch";
      toast({ title: "Generation failed", description: message, variant: "destructive" });
    } finally {
      setIsGeneratingVibe(false);
    }
  }, [selectedRecordType, selectedFormName, vibeDescription, toast]);

  const handleVibeApply = useCallback(() => {
    if (!vibePatchResult || !workingCopy) return;
    const vibeOps = vibePatchResult as unknown as { operations?: FormPatchOp[] };
    if (!vibeOps.operations || vibeOps.operations.length === 0) {
      toast({ title: "No operations", description: "Nothing to apply.", variant: "destructive" });
      return;
    }
    const updated = deepClone(workingCopy);
    for (const op of vibeOps.operations) {
      const p = op.payload as Record<string, unknown>;
      const fieldId = p.targetFieldId as string;
      if (op.type === "toggleRequired" || op.type === "toggleReadOnly" || op.type === "toggleVisible") {
        const key = op.type === "toggleRequired" ? "required" : op.type === "toggleReadOnly" ? "readOnly" : "visible";
        const val = p.value as boolean;
        if (updated.fields[fieldId]) {
          updated.fields[fieldId].effective[key] = val;
        }
        for (const section of updated.sections) {
          for (const placement of section.placements) {
            if (placement.fieldDefinitionId === fieldId && placement.field) {
              placement.field.effective[key] = val;
            }
          }
        }
      } else if (op.type === "moveField") {
        const sectionId = p.sectionId as string;
        const orderIndex = p.orderIndex as number;
        const section = updated.sections.find((s) => s.id === sectionId);
        if (section) {
          const idx = section.placements.findIndex((pl) => pl.fieldDefinitionId === fieldId);
          if (idx !== -1 && orderIndex >= 0 && orderIndex < section.placements.length && orderIndex !== idx) {
            const [moved] = section.placements.splice(idx, 1);
            section.placements.splice(orderIndex, 0, moved);
            section.placements.forEach((pl, i) => (pl.orderIndex = i));
          }
        }
      }
    }
    setWorkingCopy(updated);
    setPendingOperations((prev) => [...prev, ...vibeOps.operations!]);
    toast({ title: "Patch applied", description: `${vibeOps.operations.length} operation(s) merged into working copy.` });
  }, [vibePatchResult, workingCopy, toast]);

  const handleVibeSave = useCallback(async () => {
    if (!vibePatchResult || !selectedRecordType || !selectedFormName) return;
    const vibeOps = vibePatchResult as unknown as { operations?: FormPatchOp[] };
    if (!vibeOps.operations || !Array.isArray(vibeOps.operations) || vibeOps.operations.length === 0) {
      toast({ title: "No operations", description: "The generated patch contains no operations.", variant: "destructive" });
      return;
    }
    setIsSavingVibe(true);
    try {
      const res = await apiRequest("POST", `/api/forms/${selectedRecordType}/${selectedFormName}/overrides`, {
        changeSummary: `Vibe patch: ${vibeDescription.trim().slice(0, 100)}`,
        operations: vibeOps.operations,
      });
      const data = await res.json();
      setSaveResult({ overrideId: data.overrideId || data.id, changeId: data.changeId });
      toast({ title: "Vibe patch saved", description: `Override ${data.overrideId || data.id} created.` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save vibe patch";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    } finally {
      setIsSavingVibe(false);
    }
  }, [vibePatchResult, selectedRecordType, selectedFormName, vibeDescription, toast]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Form Studio</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visual form editor with override patches
        </p>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Record Type</label>
          <Select value={selectedRecordType} onValueChange={setSelectedRecordType} data-testid="select-record-type">
            <SelectTrigger className="w-[220px]" data-testid="select-record-type">
              <SelectValue placeholder={loadingRecordTypes ? "Loading..." : "Select record type"} />
            </SelectTrigger>
            <SelectContent>
              {recordTypes?.map((rt) => (
                <SelectItem key={rt.id} value={rt.name}>
                  {rt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Form Name</label>
          <Select
            value={selectedFormName}
            onValueChange={setSelectedFormName}
            disabled={!selectedRecordType || filteredFormDefs.length === 0}
          >
            <SelectTrigger className="w-[220px]" data-testid="select-form-name">
              <SelectValue placeholder={loadingFormDefs ? "Loading..." : "Select form"} />
            </SelectTrigger>
            <SelectContent>
              {filteredFormDefs.map((fd) => (
                <SelectItem key={fd.id} value={fd.name}>
                  {fd.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={handleFetchForm}
          disabled={!selectedRecordType || !selectedFormName || loadingCompiled}
          data-testid="button-fetch-form"
        >
          {loadingCompiled ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
          Load Form
        </Button>
      </div>

      {loadingCompiled && (
        <div className="space-y-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {workingCopy && (
        <div className="flex gap-4 flex-col lg:flex-row">
          <div className="lg:w-[60%] space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                <CardTitle className="text-base font-medium">
                  {workingCopy.formDefinition.name}
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" data-testid="badge-overrides">
                    {workingCopy.overridesApplied} overrides
                  </Badge>
                  <Badge variant="outline" data-testid="badge-version">
                    v{workingCopy.formDefinition.version}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScrollArea className="max-h-[600px]">
                  {workingCopy.sections
                    .sort((a, b) => a.orderIndex - b.orderIndex)
                    .map((section) => (
                      <div key={section.id} className="mb-4">
                        <h3 className="text-sm font-medium text-muted-foreground mb-2" data-testid={`section-title-${section.id}`}>
                          {section.title}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {section.placements
                            .sort((a, b) => a.orderIndex - b.orderIndex)
                            .map((placement) => {
                              const field = placement.field;
                              const isSelected = selectedFieldId === field.id;
                              return (
                                <div
                                  key={field.id}
                                  className={`flex items-center justify-between gap-2 p-3 rounded-md cursor-pointer border transition-colors ${
                                    isSelected
                                      ? "border-primary bg-primary/5"
                                      : "border-transparent hover-elevate"
                                  }`}
                                  onClick={() => setSelectedFieldId(field.id)}
                                  data-testid={`field-card-${field.id}`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate">{field.label}</p>
                                    <p className="text-xs text-muted-foreground font-mono truncate">{field.name}</p>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <Badge variant="secondary" className="text-[10px]">
                                      {field.fieldType}
                                    </Badge>
                                    {field.effective.required && (
                                      <Asterisk className="w-3 h-3 text-destructive" />
                                    )}
                                    {field.effective.readOnly && (
                                      <Lock className="w-3 h-3 text-muted-foreground" />
                                    )}
                                    {!field.effective.visible && (
                                      <EyeOff className="w-3 h-3 text-muted-foreground" />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                        <Separator className="mt-4" />
                      </div>
                    ))}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <div className="lg:w-[40%] space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">Field Editor</CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedField ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Select a field from the form preview to edit
                  </p>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{selectedField.label}</p>
                      <p className="text-xs text-muted-foreground font-mono">{selectedField.name}</p>
                      <Badge variant="secondary" className="mt-1">{selectedField.fieldType}</Badge>
                    </div>

                    <Separator />

                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Reorder</p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => moveField("up")}
                          disabled={!selectedFieldPlacement || selectedFieldPlacement.placementIndex === 0}
                          data-testid="button-move-up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => moveField("down")}
                          disabled={
                            !selectedFieldPlacement ||
                            selectedFieldPlacement.placementIndex >=
                              selectedFieldPlacement.section.placements.length - 1
                          }
                          data-testid="button-move-down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Move to Section</p>
                      <Select
                        value={selectedFieldPlacement?.section.id || ""}
                        onValueChange={moveToSection}
                      >
                        <SelectTrigger data-testid="select-move-section">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {workingCopy.sections.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <p className="text-xs font-medium text-muted-foreground">Flags</p>

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {selectedField.effective.visible ? (
                            <Eye className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <EyeOff className="w-4 h-4 text-muted-foreground" />
                          )}
                          <span className="text-sm">Visible</span>
                        </div>
                        <Switch
                          checked={selectedField.effective.visible}
                          onCheckedChange={(val) => updateFieldEffective(selectedFieldId!, "visible", val)}
                          data-testid="switch-visible"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {selectedField.effective.readOnly ? (
                            <Lock className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <Unlock className="w-4 h-4 text-muted-foreground" />
                          )}
                          <span className="text-sm">Read Only</span>
                        </div>
                        <Switch
                          checked={selectedField.effective.readOnly}
                          onCheckedChange={(val) => updateFieldEffective(selectedFieldId!, "readOnly", val)}
                          data-testid="switch-readonly"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Asterisk className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">Required</span>
                          {selectedField.isRequired && (
                            <span className="text-[10px] text-muted-foreground">(locked)</span>
                          )}
                        </div>
                        <Switch
                          checked={selectedField.effective.required}
                          onCheckedChange={(val) => updateFieldEffective(selectedFieldId!, "required", val)}
                          disabled={selectedField.isRequired}
                          data-testid="switch-required"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">Save as Override</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Change summary..."
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  data-testid="input-change-summary"
                />
                <Button
                  onClick={handleSaveOverride}
                  disabled={isSaving || !changeSummary.trim()}
                  className="w-full"
                  data-testid="button-save-override"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Override
                </Button>
                {saveResult && (
                  <div className="space-y-2 p-3 rounded-md bg-muted/50">
                    <p className="text-xs text-muted-foreground">
                      Override: <span className="font-mono">{saveResult.overrideId}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Change: <span className="font-mono">{saveResult.changeId}</span>
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleActivateOverride}
                      disabled={isActivating}
                      data-testid="button-activate-override"
                    >
                      {isActivating ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4 mr-2" />
                      )}
                      Activate
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Wand2 className="w-4 h-4" />
                  Vibe Patch
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder="Describe your changes in natural language..."
                  value={vibeDescription}
                  onChange={(e) => setVibeDescription(e.target.value)}
                  className="resize-none"
                  rows={3}
                  data-testid="textarea-vibe-description"
                />
                <Button
                  onClick={handleVibeGenerate}
                  disabled={isGeneratingVibe || !vibeDescription.trim()}
                  className="w-full"
                  data-testid="button-vibe-generate"
                >
                  {isGeneratingVibe ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4 mr-2" />
                  )}
                  Generate Patch
                </Button>
                {vibePatchResult && (
                  <div className="space-y-2">
                    <ScrollArea className="max-h-[200px]">
                      <pre className="text-xs font-mono p-3 rounded-md bg-muted/50 whitespace-pre-wrap" data-testid="text-vibe-patch-preview">
                        {JSON.stringify(vibePatchResult, null, 2)}
                      </pre>
                    </ScrollArea>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleVibeApply}
                        className="flex-1"
                        data-testid="button-vibe-apply"
                      >
                        Apply to Working Copy
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleVibeSave}
                        disabled={isSavingVibe}
                        className="flex-1"
                        data-testid="button-vibe-save"
                      >
                        {isSavingVibe ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        Save Directly
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}