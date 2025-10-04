import { useState } from "react";

interface ShareButtonProps {
  listingId: number;
  title: string;
}

export function ShareButton({ listingId, title }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const botUsername = import.meta.env.VITE_BOT_USERNAME || "fleamarketx_bot";
    const shareUrl = `https://t.me/${botUsername}?start=listing_${listingId}`;
    const shareText = `Check out this cool item I found: ${title}\n${shareUrl}`;

    // Try Web Share API first (works on mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Check out: ${title}`,
          text: shareText,
        });
        return;
      } catch (err) {
        // User cancelled or share failed, fall back to clipboard
        if ((err as Error).name !== "AbortError") {
          console.error("Share failed:", err);
        }
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      alert("Failed to share. Please try again.");
    }
  };

  return (
    <button
      onClick={handleShare}
      className="w-full bg-blue-500 text-white py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors"
    >
      {copied ? "✓ Copied!" : "📤 Share"}
    </button>
  );
}
