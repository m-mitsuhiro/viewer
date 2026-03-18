import { useEffect, useState } from "react";
import { commands, FolderEntry } from "../../lib/tauri";
import { useAppStore } from "../../store";

interface Props {
  onFolderSelect: (path: string) => void;
}

export default function Sidebar({ onFolderSelect }: Props) {
  const [drives, setDrives] = useState<FolderEntry[]>([]);
  const { currentFolder } = useAppStore();

  useEffect(() => {
    commands.getDrives().then(setDrives).catch(console.error);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold text-[#757575] uppercase tracking-wider border-b border-[#444]">
        フォルダ
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {drives.map((drive) => (
          <FolderNode
            key={drive.path}
            entry={drive}
            depth={0}
            currentFolder={currentFolder}
            onSelect={onFolderSelect}
          />
        ))}
      </div>
    </div>
  );
}

interface NodeProps {
  entry: FolderEntry;
  depth: number;
  currentFolder: string | null;
  onSelect: (path: string) => void;
}

function FolderNode({ entry, depth, currentFolder, onSelect }: NodeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [children, setChildren] = useState<FolderEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const isSelected = currentFolder === entry.path;

  const toggle = async () => {
    if (!isOpen && !loaded) {
      const kids = await commands.getChildren(entry.path).catch(() => []);
      setChildren(kids);
      setLoaded(true);
    }
    setIsOpen((v) => !v);
  };

  const handleClick = () => {
    onSelect(entry.path);
    if (entry.hasChildren) toggle();
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-[3px] cursor-pointer rounded-sm mx-1 text-sm
          ${isSelected ? "bg-[#4a9eff]/20 text-[#4a9eff]" : "hover:bg-[#333] text-[#e0e0e0]"}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={handleClick}
      >
        {/* Arrow */}
        <span className="w-3 flex-shrink-0 text-[#757575]">
          {entry.hasChildren ? (
            <svg
              className={`w-3 h-3 transition-transform ${isOpen ? "rotate-90" : ""}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          ) : null}
        </span>
        {/* Folder icon */}
        <svg className="w-4 h-4 flex-shrink-0 text-[#f0b429]" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
        <span className="truncate" title={entry.name}>{entry.name}</span>
      </div>

      {isOpen && children.length > 0 && (
        <div>
          {children.map((child) => (
            <FolderNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              currentFolder={currentFolder}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
