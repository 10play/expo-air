import { useState, useCallback, useRef } from "react";
import {
  getWebSocketClient,
  type ServerMessage,
  type GitChange,
  type BranchInfo,
  type ImageAttachment,
} from "../services/websocket";
import { Linking } from "react-native";

interface UseGitStateOptions {
  handleSubmit: (prompt: string, images?: ImageAttachment[]) => void;
  setActiveTab: (tab: "chat" | "changes") => void;
}

export function useGitState({ handleSubmit, setActiveTab }: UseGitStateOptions) {
  const [branchName, setBranchName] = useState<string>("");
  const [gitChanges, setGitChanges] = useState<GitChange[]>([]);
  const [hasPR, setHasPR] = useState(false);
  const [prUrl, setPrUrl] = useState<string | undefined>();
  const [showBranchSwitcher, setShowBranchSwitcher] = useState(false);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  const previousBranchRef = useRef<string>("");

  // Extract PR number from URL (e.g., "https://github.com/org/repo/pull/12" → "12")
  const prNumber = prUrl?.match(/\/pull\/(\d+)/)?.[1];

  const handleGitMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "git_status":
        setBranchName(message.branchName);
        setGitChanges(message.changes);
        setHasPR(message.hasPR);
        setPrUrl(message.prUrl);
        break;
      case "branches_list":
        setBranches(message.branches);
        setBranchesLoading(false);
        break;
      case "branch_switched":
        if (message.success) {
          setBranchError(null);
        } else if (message.error) {
          // Revert optimistic update on failure
          const prev = previousBranchRef.current;
          setBranchName(prev);
          setBranches((b) =>
            b.map((br) => ({ ...br, isCurrent: br.name === prev }))
          );
          setShowBranchSwitcher(true);
          setBranchError(message.error);
        }
        break;
      case "branch_created":
        if (message.success) {
          setShowBranchSwitcher(false);
          setBranchError(null);
        } else if (message.error) {
          setBranchError(message.error);
        }
        break;
    }
  }, []);

  const handleCommit = useCallback(() => {
    setActiveTab("chat");
    handleSubmit("Look at my current git changes and create a commit with a good conventional commit message. Stage all changes, commit them, and push to the remote.");
  }, [handleSubmit, setActiveTab]);

  const handleCreatePR = useCallback(() => {
    setActiveTab("chat");
    handleSubmit("Create a pull request for my current branch. First commit any uncommitted changes with a good message. Then generate a title and description based on the commits, and use `gh pr create --title \"...\" --body \"...\"` (non-interactive mode) to create it. Push to remote first if needed.");
  }, [handleSubmit, setActiveTab]);

  const handleViewPR = useCallback(() => {
    if (prUrl) {
      Linking.openURL(prUrl);
    }
  }, [prUrl]);

  const handleDiscard = useCallback(() => {
    const client = getWebSocketClient();
    if (client) {
      client.requestDiscardChanges();
    }
  }, []);

  const handleBranchPress = useCallback(() => {
    setShowBranchSwitcher((prev) => !prev);
    // Fetch branches when opening (side-effect outside state updater)
    if (!showBranchSwitcher) {
      setBranchesLoading(true);
      const client = getWebSocketClient();
      if (client) {
        client.requestBranches();
      }
    }
  }, [showBranchSwitcher]);

  const handleBranchSelect = useCallback((name: string) => {
    setBranchError(null);
    // Optimistically update UI before server confirms
    previousBranchRef.current = branchName;
    setBranchName(name);
    setBranches((prev) =>
      prev.map((b) => ({ ...b, isCurrent: b.name === name }))
    );
    setShowBranchSwitcher(false);
    const client = getWebSocketClient();
    if (client) {
      client.requestSwitchBranch(name);
    }
  }, [branchName]);

  const handleBranchCreate = useCallback((name: string) => {
    setBranchError(null);
    const client = getWebSocketClient();
    if (client) {
      client.requestCreateBranch(name);
    }
  }, []);

  return {
    branchName,
    gitChanges,
    hasPR,
    prUrl,
    prNumber,
    showBranchSwitcher,
    branches,
    branchesLoading,
    branchError,
    handleGitMessage,
    handleCommit,
    handleCreatePR,
    handleViewPR,
    handleDiscard,
    handleBranchPress,
    handleBranchSelect,
    handleBranchCreate,
    setShowBranchSwitcher,
    setBranchError,
  };
}
