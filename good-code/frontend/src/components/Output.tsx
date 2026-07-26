import { useSearchParams } from "react-router-dom";
import styled from "@emotion/styled";
import { CONFIG } from "../config";

export const Output = () => {
    const [searchParams] = useSearchParams();
    const replId = searchParams.get('replId') ?? '';
    const INSTANCE_URI = `http://${replId}.${CONFIG.outputBaseDomain}`;

    return (
      <Wrap>
        <Header>
          <Label>Preview</Label>
          <Link href={INSTANCE_URI} target="_blank" rel="noreferrer">
            Open in new tab
          </Link>
        </Header>
        <Frame title="output" src={INSTANCE_URI} />
      </Wrap>
    );
}

const Wrap = styled.div`
  height: 40vh;
  min-height: 240px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 14px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.10);
`;

const Label = styled.div`
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
`;

const Link = styled.a`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
  text-decoration: none;
  border: 1px solid rgba(255, 255, 255, 0.14);
  padding: 6px 10px;
  border-radius: 999px;

  &:hover {
    color: white;
    border-color: rgba(255, 255, 255, 0.22);
  }
`;

const Frame = styled.iframe`
  width: 100%;
  height: calc(40vh - 44px);
  min-height: 196px;
  border: 0;
  background: white;
`;