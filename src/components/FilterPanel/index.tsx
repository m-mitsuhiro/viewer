import { useAppStore } from "../../store";

const EXT_GROUPS = [
  { label: "画像", exts: ["jpg", "png", "webp", "gif", "bmp"] },
  { label: "動画", exts: ["mp4", "mkv", "avi", "mov", "wmv", "webm"] },
];
const ALL_EXTS = EXT_GROUPS.flatMap((g) => g.exts);

export default function FilterPanel() {
  const {
    dateFrom, dateTo, setDateFrom, setDateTo,
    sizeMinKB, sizeMaxKB, setSizeMinKB, setSizeMaxKB,
    tagFilter, setTagFilter,
    extFilter, setExtFilter,
    nameFilter, setNameFilter,
  } = useAppStore();

  const toggleExt = (ext: string) => {
    setExtFilter(extFilter.includes(ext) ? extFilter.filter((e) => e !== ext) : [...extFilter, ext]);
  };

  const activeCount = [
    nameFilter,
    dateFrom, dateTo,
    sizeMinKB > 0, sizeMaxKB > 0,
    tagFilter.length > 0,
    extFilter.length > 0,
  ].filter(Boolean).length;

  const clearAll = () => {
    setNameFilter("");
    setDateFrom(""); setDateTo("");
    setSizeMinKB(0); setSizeMaxKB(0);
    setTagFilter([]);
    setExtFilter([]);
  };

  const addTagFilter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const val = (e.target as HTMLInputElement).value.trim();
    if (val && !tagFilter.includes(val)) setTagFilter([...tagFilter, val]);
    (e.target as HTMLInputElement).value = "";
  };

  return (
    <div className="border-t border-[#333] bg-[#222] px-3 py-2 flex flex-wrap gap-x-4 gap-y-2 items-start text-xs">

      {/* Name filter */}
      <div className="flex flex-col gap-1">
        <span className="text-[#757575] font-semibold">ファイル名</span>
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="部分一致"
            className="w-36 bg-[#2d2d2d] border border-[#444] rounded px-2 py-0.5 text-[#e0e0e0] placeholder-[#555] focus:outline-none focus:border-[#4a9eff]"
          />
          {nameFilter && (
            <button onClick={() => setNameFilter("")} className="text-[#757575] hover:text-[#e0e0e0]">✕</button>
          )}
        </div>
      </div>

      {/* Extension filter */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-[#757575] font-semibold">種別</span>
          {extFilter.length > 0 && (
            <button onClick={() => setExtFilter([])} className="text-[#757575] hover:text-[#e0e0e0]">✕ クリア</button>
          )}
          {extFilter.length === 0 && (
            <button onClick={() => setExtFilter(ALL_EXTS)} className="text-[#757575] hover:text-[#e0e0e0]">全選択</button>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {EXT_GROUPS.map((group) => (
            <div key={group.label} className="flex items-center gap-1">
              <span className="text-[#555] w-6 text-right">{group.label[0]}</span>
              <div className="flex flex-wrap gap-1">
                {group.exts.map((ext) => (
                  <button
                    key={ext}
                    onClick={() => toggleExt(ext)}
                    className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                      extFilter.includes(ext)
                        ? "bg-[#4a9eff] border-[#4a9eff] text-white"
                        : "bg-[#2d2d2d] border-[#444] text-[#9e9e9e] hover:bg-[#383838]"
                    }`}
                  >
                    .{ext}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Date filter */}
      <div className="flex flex-col gap-1">
        <span className="text-[#757575] font-semibold">日付</span>
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-[#2d2d2d] border border-[#444] rounded px-1 py-0.5 text-[#e0e0e0] focus:outline-none focus:border-[#4a9eff]"
          />
          <span className="text-[#757575]">〜</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-[#2d2d2d] border border-[#444] rounded px-1 py-0.5 text-[#e0e0e0] focus:outline-none focus:border-[#4a9eff]"
          />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-[#757575] hover:text-[#e0e0e0]">✕</button>
          )}
        </div>
      </div>

      {/* Size filter */}
      <div className="flex flex-col gap-1">
        <span className="text-[#757575] font-semibold">サイズ (KB)</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            value={sizeMinKB || ""}
            onChange={(e) => setSizeMinKB(Math.max(0, Number(e.target.value)))}
            placeholder="最小"
            className="w-16 bg-[#2d2d2d] border border-[#444] rounded px-1 py-0.5 text-[#e0e0e0] placeholder-[#555] focus:outline-none focus:border-[#4a9eff]"
          />
          <span className="text-[#757575]">〜</span>
          <input
            type="number"
            min={0}
            value={sizeMaxKB || ""}
            onChange={(e) => setSizeMaxKB(Math.max(0, Number(e.target.value)))}
            placeholder="最大"
            className="w-16 bg-[#2d2d2d] border border-[#444] rounded px-1 py-0.5 text-[#e0e0e0] placeholder-[#555] focus:outline-none focus:border-[#4a9eff]"
          />
          {(sizeMinKB > 0 || sizeMaxKB > 0) && (
            <button onClick={() => { setSizeMinKB(0); setSizeMaxKB(0); }} className="text-[#757575] hover:text-[#e0e0e0]">✕</button>
          )}
        </div>
      </div>

      {/* Tag filter */}
      <div className="flex flex-col gap-1">
        <span className="text-[#757575] font-semibold">タグ</span>
        <div className="flex flex-wrap items-center gap-1">
          {tagFilter.map(t => (
            <span key={t} className="flex items-center gap-0.5 bg-[#4a9eff]/20 text-[#4a9eff] px-2 py-0.5 rounded-full">
              {t}
              <button onClick={() => setTagFilter(tagFilter.filter(x => x !== t))} className="hover:text-red-400">✕</button>
            </span>
          ))}
          <input
            type="text"
            onKeyDown={addTagFilter}
            placeholder="Enterで追加"
            className="w-24 bg-[#2d2d2d] border border-[#444] rounded px-2 py-0.5 text-[#e0e0e0] placeholder-[#555] focus:outline-none focus:border-[#4a9eff]"
          />
        </div>
      </div>

      {/* Clear all */}
      {activeCount > 0 && (
        <div className="flex flex-col justify-end pb-0.5">
          <button onClick={clearAll} className="px-2 py-1 text-xs text-[#757575] hover:text-[#e0e0e0] border border-[#444] rounded bg-[#2d2d2d] hover:bg-[#383838]">
            すべてリセット
          </button>
        </div>
      )}
    </div>
  );
}
