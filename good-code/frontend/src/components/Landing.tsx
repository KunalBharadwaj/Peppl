/** Import necessary libraries */
import axios from 'axios';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { GoogleLogin } from '@react-oauth/google';
import { CONFIG } from '../config';
import { authHeader, useAuth } from '../auth/useAuth';

/** Constants */
const SLUG_WORKS = ["car", "dog", "computer", "person", "inside", "word", "for", "please", "to", "cool", "open", "source"];

/** Styled components */
const Container = styled.div`
  min-height: 100vh;
  padding: 48px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background:
    radial-gradient(800px 400px at 20% 10%, rgba(84, 132, 255, 0.14), transparent 60%),
    radial-gradient(700px 500px at 80% 60%, rgba(255, 84, 210, 0.10), transparent 60%),
    #0f1115;
`;

const Title = styled.h1`
  color: white;
  margin: 0;
  font-size: 44px;
  letter-spacing: -0.03em;
`;

const Subtitle = styled.p`
  margin: 0;
  color: rgba(255, 255, 255, 0.72);
  max-width: 640px;
  text-align: center;
  line-height: 1.35;
`;

const Card = styled.div`
  width: min(560px, 92vw);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 16px;
  padding: 18px;
  backdrop-filter: blur(10px);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.40);
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 160px;
  gap: 10px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const StyledInput = styled.input`
  width: 100%;
  padding: 12px 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.35);
  color: white;
  outline: none;

  &:focus {
    border-color: rgba(84, 132, 255, 0.7);
    box-shadow: 0 0 0 3px rgba(84, 132, 255, 0.18);
  }
`;

const StyledSelect = styled.select`
  width: 100%;
  padding: 12px 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.35);
  color: white;
  outline: none;

  &:focus {
    border-color: rgba(84, 132, 255, 0.7);
    box-shadow: 0 0 0 3px rgba(84, 132, 255, 0.18);
  }
`;

const StyledButton = styled.button`
  padding: 12px 16px;
  background: linear-gradient(135deg, #3a7bff, #6d3aff);
  color: white;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 600;
  letter-spacing: 0.01em;
  transition: transform 120ms ease, filter 120ms ease, opacity 120ms ease;
  &:hover {
    filter: brightness(1.05);
  }

  &:active {
    transform: translateY(1px);
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

const Hint = styled.p`
  margin: 0;
  color: rgba(255, 255, 255, 0.60);
  font-size: 12px;
  line-height: 1.4;
`;

const ErrorText = styled.p`
  margin: 0;
  color: rgba(255, 120, 120, 0.95);
  font-size: 13px;
  line-height: 1.4;
`;

const AccountRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
`;

const LinkButton = styled.button`
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  &:hover {
    color: white;
  }
`;

const SignInWrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
`;

/** Helper function */
function getRandomSlug() {
    let slug = "";
    for (let i = 0; i < 3; i++) {
        slug += SLUG_WORKS[Math.floor(Math.random() * SLUG_WORKS.length)];
    }
    return slug;
}

/** Component */
export const Landing = () => {
    const [language, setLanguage] = useState("node-js");
    const [replId, setReplId] = useState(getRandomSlug());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();
    const { token, user, isAuthenticated, login, logout } = useAuth();

    const createProject = async () => {
      setLoading(true);
      setError(null);
      try {
        await axios.post(
          `${CONFIG.controlPlaneUrl}/project`,
          { replId, language },
          { headers: authHeader(token) }
        );
        navigate(`/coding/?replId=${encodeURIComponent(replId)}`);
      } catch (err) {
        if (axios.isAxiosError(err)) {
          if (err.response?.status === 401) {
            logout();
            setError("Your session expired. Please sign in again.");
          } else if (err.response?.status === 429) {
            setError(
              typeof err.response.data === "string"
                ? err.response.data
                : "You've reached your workspace limit."
            );
          } else if (err.response?.status === 409) {
            setError("That workspace ID is taken. Try another.");
          } else {
            setError(
              (typeof err.response?.data === "string" && err.response.data) ||
                err.message ||
                "Failed to create workspace."
            );
          }
        } else {
          setError("Failed to create workspace.");
        }
      } finally {
        setLoading(false);
      }
    };

    return (
      <Container>
        <Title>Peppl</Title>
        <Subtitle>
          Spin up a disposable coding workspace with an editor, terminal, and live output.
        </Subtitle>

        <Card>
          {isAuthenticated ? (
            <>
              <AccountRow>
                <span>Signed in as {user?.name ?? user?.email}</span>
                <LinkButton onClick={logout}>Sign out</LinkButton>
              </AccountRow>

              <Row>
                <StyledInput
                  onChange={(e) => setReplId(e.target.value)}
                  type="text"
                  placeholder="Workspace ID"
                  value={replId}
                  spellCheck={false}
                />
                <StyledSelect
                  name="language"
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="node-js">Node.js</option>
                  <option value="python">Python</option>
                </StyledSelect>
              </Row>

              <StyledButton
                disabled={loading || replId.trim().length === 0}
                onClick={createProject}
              >
                {loading ? "Starting..." : "Start coding"}
              </StyledButton>

              {error ? <ErrorText>{error}</ErrorText> : null}

              <Hint>
                Tip: pick a memorable workspace ID if you want to reconnect later.
              </Hint>
            </>
          ) : (
            <SignInWrap>
              <Subtitle>Sign in with Google to create a workspace.</Subtitle>
              <GoogleLogin
                onSuccess={async (cred) => {
                  setError(null);
                  if (!cred.credential) {
                    setError("Google sign-in failed. Please try again.");
                    return;
                  }
                  try {
                    await login(cred.credential);
                  } catch {
                    setError("Sign-in failed. Please try again.");
                  }
                }}
                onError={() => setError("Google sign-in was cancelled or failed.")}
              />
              {error ? <ErrorText>{error}</ErrorText> : null}
            </SignInWrap>
          )}
        </Card>
      </Container>
    );
}
