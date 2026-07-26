import { useEffect, useState } from 'react';
import { Socket, io } from 'socket.io-client';
import { Editor } from './Editor';
import { File, RemoteFile, Type } from './external/editor/utils/file-manager';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styled from '@emotion/styled';
import { Output } from './Output';
import { TerminalComponent as Terminal } from './Terminal';
import axios from 'axios';
import { CONFIG } from '../config';
import { authHeader, useAuth } from '../auth/useAuth';
import { FiExternalLink, FiRefreshCw } from "react-icons/fi";

function useSocket(replId: string) {
    const [socket, setSocket] = useState<Socket | null>(null);

    useEffect(() => {
        // Reach the workspace pod at <replId>.<workspaceBaseDomain>, routed by the
        // wildcard-host Ingress. Use wss when the app is served over https.
        const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const newSocket = io(`${scheme}://${replId}.${CONFIG.workspaceBaseDomain}`);
        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, [replId]);

    return socket;
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(10px);
`;

const Workspace = styled.div`
  display: flex;
  margin: 0;
  font-size: 16px;
  width: 100%;
  height: calc(100vh - 52px);
  min-height: 0;
  gap: 12px;
  padding: 12px;
`;

const LeftPanel = styled.div`
  flex: 1 1 60%;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 14px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.22);
`;

const RightPanel = styled.div`
  flex: 0 0 520px;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;

  @media (max-width: 1020px) {
    flex: 0 0 44%;
  }

  @media (max-width: 860px) {
    display: none;
  }
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
`;

const ReplPill = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.70);
  border: 1px solid rgba(255, 255, 255, 0.14);
  padding: 6px 10px;
  border-radius: 999px;
  max-width: 55vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Button = styled.button<{ $primary?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  padding: 8px 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: ${({ $primary }) =>
    $primary ? "linear-gradient(135deg, #3a7bff, #6d3aff)" : "rgba(255, 255, 255, 0.04)"};
  color: white;

  &:hover {
    border-color: rgba(255, 255, 255, 0.22);
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

const Boot = styled.div`
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.80);
`;

const RightPanelInner = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  flex: 1;
`;

const TerminalWrap = styled.div`
  flex: 1;
  min-height: 0;
`;


export const CodingPage = () => {
    const [podCreated, setPodCreated] = useState(false);
    const [bootError, setBootError] = useState<string | null>(null);
    const [searchParams] = useSearchParams();
    const replId = searchParams.get('replId') ?? '';
    const { token, isAuthenticated, logout } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        // A workspace can only be booted by a signed-in user.
        if (!isAuthenticated) {
            navigate('/');
            return;
        }
        if (replId) {
            axios.post(
                `${CONFIG.orchestratorUrl}/start`,
                { replId },
                { headers: authHeader(token) }
            )
                .then(() => setPodCreated(true))
                .catch((err) => {
                  if (axios.isAxiosError(err) && err.response?.status === 401) {
                    logout();
                    navigate('/');
                    return;
                  }
                  setBootError(err?.message ?? "Failed to boot workspace");
                });
        }
    }, [replId, isAuthenticated, token, navigate, logout]);

    if (!podCreated) {
        return (
          <Boot>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>Booting workspace…</div>
              <div style={{ marginTop: 6, color: "rgba(255,255,255,0.65)" }}>
                {replId ? `replId: ${replId}` : "Missing replId"}
              </div>
              {bootError ? (
                <div style={{ marginTop: 10, color: "rgba(255,120,120,0.95)" }}>
                  {bootError}
                </div>
              ) : null}
            </div>
          </Boot>
        );
    }
    return <CodingPagePostPodCreation />

}

export const CodingPagePostPodCreation = () => {
    const [searchParams] = useSearchParams();
    const replId = searchParams.get('replId') ?? '';
    const [loaded, setLoaded] = useState(false);
    const socket = useSocket(replId);
    const [fileStructure, setFileStructure] = useState<RemoteFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<File | undefined>(undefined);
    const [showOutput, setShowOutput] = useState(false);

    useEffect(() => {
        if (socket) {
            socket.on('loaded', ({ rootContent }: { rootContent: RemoteFile[]}) => {
                setLoaded(true);
                setFileStructure(rootContent);
            });
        }
    }, [socket]);

    const onSelect = (file: File) => {
        if (file.type === Type.DIRECTORY) {
            socket?.emit("fetchDir", file.path, (data: RemoteFile[]) => {
                setFileStructure(prev => {
                    const allFiles = [...prev, ...data];
                    return allFiles.filter((file, index, self) => 
                        index === self.findIndex(f => f.path === file.path)
                    );
                });
            });
        } else {
            socket?.emit("fetchContent", { path: file.path }, (data: string) => {
                file.content = data;
                setSelectedFile(file);
            });
        }
    };
    
    if (!socket) {
      return <Boot>Connecting…</Boot>;
    }

    if (!loaded) {
        return <Boot>Loading workspace…</Boot>;
    }

    return (
        <Container>
            <TopBar>
              <Brand>
                <div style={{ fontWeight: 800, letterSpacing: "-0.02em" }}>Peppl</div>
                <ReplPill title={replId}>{replId}</ReplPill>
              </Brand>
              <Actions>
                <Button
                  onClick={() => setShowOutput(!showOutput)}
                  $primary={showOutput}
                  title={showOutput ? "Hide preview" : "Show preview"}
                >
                  {showOutput ? "Hide preview" : "Show preview"}
                </Button>
                <Button
                  onClick={() => window.location.reload()}
                  title="Reload page"
                >
                  <FiRefreshCw /> Reload
                </Button>
                <Button
                  onClick={() => {
                    const url = `${window.location.origin}/coding/?replId=${encodeURIComponent(replId)}`;
                    void navigator.clipboard?.writeText(url);
                  }}
                  title="Copy link"
                >
                  <FiExternalLink /> Copy link
                </Button>
              </Actions>
            </TopBar>
            <Workspace>
                <LeftPanel>
                    <Editor socket={socket} selectedFile={selectedFile} onSelect={onSelect} files={fileStructure} />
                </LeftPanel>
                <RightPanel>
                    <RightPanelInner>
                      {showOutput && <Output />}
                      <TerminalWrap>
                        <Terminal socket={socket} />
                      </TerminalWrap>
                    </RightPanelInner>
                </RightPanel>
            </Workspace>
        </Container>
    );
}
