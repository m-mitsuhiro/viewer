import { useEffect, useState } from "react";
import { useAppStore } from "../../store";
import { commands, formatBytes, formatDate } from "../../lib/tauri";

export default function InfoPanel() {
  const { selectedFile, currentMetadata, setCurrentMetadata, checkedFileIds, files } = useAppStore();
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");

  const bulkCount = checkedFileIds.size > 1 ? checkedFileIds.size : 0;

  useEffect(() => {
    if (!selectedFile) {
      setTags([]);
      return;
    }
    commands.getFileTags(selectedFile.path).then(setTags).catch(console.error);
    commands.getMetadata(selectedFile.path).then(setCurrentMetadata).catch(console.error);
  }, [selectedFile?.path]);

  const handleAddTag = async () => {
    const tag = newTag.trim();
    if (!tag) return;
    if (bulkCount > 0) {
      const targets = files.filter(f => checkedFileIds.has(f.id));
      await Promise.all(targets.map(f => commands.addTag(f.path, tag).catch(console.error)));
      if (selectedFile) setTags((prev) => [...new Set([...prev, tag])].sort());
    } else {
      if (!selectedFile) return;
      await commands.addTag(selectedFile.path, tag).catch(console.error);
      setTags((prev) => [...new Set([...prev, tag])].sort());
    }
    setNewTag("");
  };

  const handleRemoveTag = async (tag: string) => {
    if (!selectedFile) return;
    await commands.removeTag(selectedFile.path, tag).catch(console.error);
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  if (!selectedFile) {
    return (
      <div className="flex items-center justify-center h-full text-[#757575] text-sm p-4 text-center">
        ファイルを選択すると情報が表示されます
      </div>
    );
  }

  const m = currentMetadata;

  return (
    <div className="p-3 text-sm space-y-4">
      <h3 className="font-semibold text-[#e0e0e0] truncate">{selectedFile.name}</h3>

      {/* Tags */}
      <Section title="タグ">
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 bg-[#4a9eff]/20 text-[#4a9eff] text-xs px-2 py-0.5 rounded-full"
            >
              {tag}
              <button
                onClick={() => handleRemoveTag(tag)}
                className="hover:text-red-400 transition-colors"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddTag(); }}
            placeholder={bulkCount > 0 ? `${bulkCount}件に追加…` : "タグを追加…"}
            className="flex-1 bg-[#2d2d2d] border border-[#444] rounded px-2 py-1 text-xs text-[#e0e0e0] placeholder-[#757575] focus:outline-none focus:border-[#4a9eff]"
          />
          <button
            onClick={handleAddTag}
            className="px-2 py-1 bg-[#4a9eff] hover:bg-[#6db3ff] text-white text-xs rounded transition-colors"
          >
            追加
          </button>
        </div>
      </Section>

      {/* File Info */}
      <Section title="ファイル情報">
        <InfoRow label="サイズ" value={formatBytes(m?.size ?? selectedFile.size)} />
        <InfoRow label="更新日時" value={formatDate(m?.modifiedAt ?? selectedFile.modifiedAt)} />
        {m?.createdAt && <InfoRow label="作成日時" value={formatDate(m.createdAt)} />}
        {m?.width && m?.height && (
          <InfoRow label="解像度" value={`${m.width} × ${m.height}`} />
        )}
      </Section>

      {/* EXIF */}
      {m && (m.capturedAt || m.cameraModel || m.iso) && (
        <Section title="撮影情報">
          {m.capturedAt && <InfoRow label="撮影日時" value={m.capturedAt} />}
          {m.cameraMake && <InfoRow label="メーカー" value={m.cameraMake} />}
          {m.cameraModel && <InfoRow label="カメラ" value={m.cameraModel} />}
          {m.lensModel && <InfoRow label="レンズ" value={m.lensModel} />}
          {m.focalLength && <InfoRow label="焦点距離" value={m.focalLength} />}
          {m.aperture && <InfoRow label="絞り" value={m.aperture} />}
          {m.shutterSpeed && <InfoRow label="シャッター速度" value={m.shutterSpeed} />}
          {m.iso && <InfoRow label="ISO" value={String(m.iso)} />}
        </Section>
      )}

      {/* GPS */}
      {m?.gpsLat != null && m?.gpsLon != null && (
        <Section title="GPS">
          <InfoRow label="緯度" value={m.gpsLat.toFixed(6)} />
          <InfoRow label="経度" value={m.gpsLon.toFixed(6)} />
        </Section>
      )}

      {/* Path */}
      <Section title="パス">
        <p className="text-[10px] text-[#757575] break-all">{selectedFile.path}</p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold text-[#757575] uppercase tracking-wider mb-1.5">
        {title}
      </h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[#757575] flex-shrink-0">{label}</span>
      <span className="text-[#e0e0e0] text-right truncate">{value}</span>
    </div>
  );
}
