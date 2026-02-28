import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useBreathingState } from "@/hooks/useBreathingState";
import {
  BreathingIndicator,
  BreathingProgress,
} from "@/components/BreathingIndicator";
import { Button } from "@/components/ui/button";
import { Streamdown } from "streamdown";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Plus, ChevronDown, Loader2 } from "lucide-react";

export default function Home() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No login gate — go straight to workspace
  return <WorkspaceView />;
}

// ─── Workspace ───────────────────────────────────────────────────────────────

function WorkspaceView() {
  const [projectId, setProjectId] = useState<number | null>(() => {
    const saved = localStorage.getItem("flowtion_project_id");
    return saved ? parseInt(saved) : null;
  });
  const [threadId, setThreadId] = useState<number | null>(() => {
    const saved = localStorage.getItem("flowtion_thread_id");
    return saved ? parseInt(saved) : null;
  });
  const [version, setVersion] = useState<number | null>(null);

  useEffect(() => {
    if (projectId)
      localStorage.setItem("flowtion_project_id", String(projectId));
  }, [projectId]);

  useEffect(() => {
    if (threadId)
      localStorage.setItem("flowtion_thread_id", String(threadId));
  }, [threadId]);

  const breathing = useBreathingState();

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-5 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-sm font-medium text-foreground tracking-wide">
              Flowtion
            </h1>
            <ConversationSelector
              currentProjectId={projectId}
              currentThreadId={threadId}
              onSelect={(pid, tid) => {
                setProjectId(pid);
                setThreadId(tid);
              }}
              onNew={() => {
                setProjectId(null);
                setThreadId(null);
                localStorage.removeItem("flowtion_project_id");
                localStorage.removeItem("flowtion_thread_id");
              }}
            />
          </div>
          <div className="flex items-center gap-3">
            <BreathingIndicator
              state={breathing.state}
              progress={breathing.progress}
            />
            {version !== null && (
              <span className="text-xs text-muted-foreground font-mono">
                v{version}
              </span>
            )}
          </div>
        </div>
        <BreathingProgress
          state={breathing.state}
          progress={breathing.progress}
        />
      </header>

      {/* Split pane */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Thread pane — left */}
        <section className="flex-1 flex flex-col overflow-hidden border-r border-border">
          <ThreadPane
            projectId={projectId}
            threadId={threadId}
            onThreadCreated={(pid, tid) => {
              setProjectId(pid);
              setThreadId(tid);
            }}
            isBreathing={breathing.isBreathing}
          />
        </section>

        {/* Artifact pane — right */}
        <aside className="flex-1 flex flex-col overflow-hidden bg-card/30">
          <ArtifactPane
            projectId={projectId}
            threadId={threadId}
            onVersionChange={setVersion}
          />
        </aside>
      </div>
    </div>
  );
}

// ─── Conversation Selector ───────────────────────────────────────────────────

interface ConversationSelectorProps {
  currentProjectId: number | null;
  currentThreadId: number | null;
  onSelect: (projectId: number, threadId: number) => void;
  onNew: () => void;
}

function ConversationSelector({
  currentThreadId,
  onSelect,
  onNew,
}: ConversationSelectorProps) {
  const { data: threadList = [] } = trpc.flowtion.listThreads.useQuery(
    undefined,
    { retry: false }
  );
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-xs px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-md flex items-center gap-2 transition-colors"
      >
        <span>
          {currentThreadId ? `Space ${currentThreadId}` : "New space"}
        </span>
        <ChevronDown className="w-3 h-3" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 mt-1 bg-popover text-popover-foreground border border-border rounded-lg shadow-xl z-20 min-w-[260px] overflow-hidden"
            >
              <button
                onClick={() => {
                  onNew();
                  setIsOpen(false);
                }}
                className="w-full px-4 py-2.5 text-left text-sm hover:bg-accent/50 border-b border-border flex items-center gap-2 text-primary"
              >
                <Plus className="w-3.5 h-3.5" />
                New conversation
              </button>

              <div className="max-h-[280px] overflow-y-auto">
                {threadList.map((thread: any) => (
                  <button
                    key={thread.id}
                    onClick={() => {
                      onSelect(thread.projectId, thread.id);
                      setIsOpen(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left text-sm hover:bg-accent/30 border-b border-border/50 transition-colors ${
                      thread.id === currentThreadId ? "bg-accent/40" : ""
                    }`}
                  >
                    <div className="font-medium text-foreground text-xs">
                      Space {thread.id}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {thread.preview || "Empty space"}
                    </div>
                  </button>
                ))}
                {threadList.length === 0 && (
                  <div className="px-4 py-3 text-xs text-muted-foreground text-center">
                    No conversations yet
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Thread Pane ─────────────────────────────────────────────────────────────

interface ThreadPaneProps {
  projectId: number | null;
  threadId: number | null;
  onThreadCreated: (projectId: number, threadId: number) => void;
  isBreathing: boolean;
}

function ThreadPane({ projectId, threadId, onThreadCreated, isBreathing }: ThreadPaneProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const utils = trpc.useUtils();

  const { data: messageList = [], refetch } = trpc.flowtion.getMessages.useQuery(
    { threadId: threadId! },
    { enabled: !!threadId, refetchInterval: 2000 }
  );

  const sendMutation = trpc.flowtion.send.useMutation({
    onSuccess: (data) => {
      if (!threadId) {
        onThreadCreated(data.projectId, data.threadId);
      }
      refetch();
      utils.flowtion.listThreads.invalidate();
      utils.flowtion.getLatestArtifact.invalidate();
    },
  });

  const handleSend = () => {
    if (!input.trim() || sendMutation.isPending) return;

    sendMutation.mutate({
      text: input,
      projectId: projectId ?? undefined,
      threadId: threadId ?? undefined,
    });

    setInput("");
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageList]);

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {messageList.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <motion.div
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="w-12 h-12 rounded-full mx-auto"
                style={{
                  background:
                    "radial-gradient(circle, var(--primary) 0%, transparent 70%)",
                }}
              />
              <p className="text-muted-foreground text-sm font-light">
                No artifact yet. First breath creates the first form.
              </p>
            </div>
          </div>
        ) : (
          <>
            {messageList.map((msg: any) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`max-w-[85%] rounded-lg px-4 py-3 ${
                  msg.role === "user"
                    ? "ml-auto bg-primary/10 text-foreground"
                    : "mr-auto bg-secondary text-secondary-foreground"
                }`}
              >
                <div className="text-sm leading-relaxed prose prose-invert prose-sm max-w-none">
                  <Streamdown>{msg.text}</Streamdown>
                </div>
              </motion.div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border p-4 shrink-0">
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What wants to emerge?"
            className="flex-1 min-h-[52px] max-h-[180px] resize-none rounded-lg border border-input bg-secondary/50 focus:border-primary focus:ring-1 focus:ring-primary px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground transition-colors"
            rows={2}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sendMutation.isPending}
            size="icon"
            className="h-[52px] w-[52px] shrink-0"
          >
            {sendMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 font-light">
          Cmd/Ctrl + Enter to send
        </p>
      </div>
    </div>
  );
}

// ─── Artifact Pane ───────────────────────────────────────────────────────────

interface ArtifactPaneProps {
  projectId: number | null;
  threadId: number | null;
  onVersionChange: (version: number | null) => void;
}

function ArtifactPane({ projectId, threadId, onVersionChange }: ArtifactPaneProps) {
  const { data: artifact } = trpc.flowtion.getLatestArtifact.useQuery(
    { projectId: projectId!, threadId: threadId ?? undefined },
    {
      enabled: !!projectId,
      staleTime: 0,
      refetchInterval: 2500,
    }
  );

  useEffect(() => {
    if (artifact) {
      onVersionChange(artifact.v);
    }
  }, [artifact, onVersionChange]);

  return (
    <div className="h-full p-5 overflow-y-auto">
      {!artifact ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center space-y-3">
            <motion.div
              animate={{
                scale: [1, 1.05, 1],
                opacity: [0.2, 0.4, 0.2],
              }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="w-20 h-20 rounded-full mx-auto border border-border/30"
              style={{
                background:
                  "radial-gradient(circle, var(--breath-cast) 0%, transparent 80%)",
              }}
            />
            <p className="text-muted-foreground text-sm font-light">
              Waiting for first artifact...
            </p>
          </div>
        </div>
      ) : (
        <motion.div
          key={artifact.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="space-y-4"
        >
          {/* Artifact header */}
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Artifact
            </h2>
            <span className="text-xs px-2 py-0.5 bg-secondary rounded text-muted-foreground font-mono">
              v{artifact.v}
            </span>
          </div>

          {/* Artifact content */}
          <div className="bg-card rounded-lg border border-border p-5 overflow-hidden">
            {(artifact.kind === "html" || artifact.kind === "svg") && (
              <div
                className="prose prose-invert prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: artifact.uri }}
              />
            )}
            {artifact.kind === "image" && (
              <img
                src={artifact.uri}
                alt="Artifact"
                className="w-full rounded"
              />
            )}
            {artifact.kind === "markdown" && (
              <div className="prose prose-invert prose-sm max-w-none">
                <Streamdown>{artifact.uri}</Streamdown>
              </div>
            )}
          </div>

          {/* Summary */}
          {artifact.summary && (
            <p className="text-xs text-muted-foreground font-light leading-relaxed">
              {artifact.summary}
            </p>
          )}

          {/* Tags */}
          {artifact.tags && (artifact.tags as string[]).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(artifact.tags as string[]).map((tag: string, i: number) => (
                <span
                  key={i}
                  className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
