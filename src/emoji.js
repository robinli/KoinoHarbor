import { readFileSync } from "node:fs";

const emojiDataUrl = new URL(
  "../node_modules/emoji-picker-element-data/zh-hant/cldr/data.json",
  import.meta.url,
);
const emojiData = JSON.parse(readFileSync(emojiDataUrl, "utf8"));
const allowedEmoji = new Map();

function registerEmoji(emoji) {
  allowedEmoji.set(emoji, emoji);
  allowedEmoji.set(emoji.replaceAll("\uFE0F", ""), emoji);
  allowedEmoji.set(emoji.replace(/\uFE0F{2,}/g, "\uFE0F"), emoji);
}

for (const entry of emojiData) {
  registerEmoji(entry.emoji);
  for (const skin of entry.skins ?? []) registerEmoji(skin.emoji);
}

export function requireEmoji(value) {
  if (typeof value !== "string" || !allowedEmoji.has(value)) {
    const error = new Error("表情符號格式不正確或不受支援。");
    error.statusCode = 400;
    throw error;
  }

  return allowedEmoji.get(value);
}
