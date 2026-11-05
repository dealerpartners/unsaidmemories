import { usableAccessToken } from "./oauth";

/**
 * Per-network publishing. Every function makes the network's real API
 * call with the connected account's (refreshed) token and returns the
 * external post id/URL, or throws the network's error — the dispatcher
 * records that error on the per-network row, Postiz-style.
 */

export interface PublishInput {
  caption: string;
  mediaUrls: string[];
  productUrl?: string | null;
}

export interface PublishResult {
  externalId: string;
  externalUrl?: string;
}

export interface SocialAccountRow {
  id: string;
  network: string;
  external_account_id: string | null;
  handle: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
}

async function call(
  url: string,
  init: RequestInit
): Promise<any> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const VIDEO_RE = /\.(mp4|mov|webm)(\?|$)/i;

const publishers: Record<
  string,
  (account: SocialAccountRow, input: PublishInput) => Promise<PublishResult>
> = {
  async x(account, input) {
    const token = await usableAccessToken(account);
    const body: Record<string, unknown> = {
      text: [input.caption, input.productUrl].filter(Boolean).join("\n"),
    };
    if (input.mediaUrls.length > 0) {
      const mediaIds: string[] = [];
      for (const url of input.mediaUrls.slice(0, 4)) {
        const img = await fetch(url);
        if (!img.ok) throw new Error(`Could not download media ${url} (${img.status}).`);
        const form = new FormData();
        form.append("media", new Blob([await img.arrayBuffer()]), "image");
        const up = await call("https://api.twitter.com/2/media/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        const id = up.data?.id ?? up.media_id_string;
        if (id) mediaIds.push(String(id));
      }
      if (mediaIds.length) body.media = { media_ids: mediaIds };
    }
    const out = await call("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: bearer(token),
      body: JSON.stringify(body),
    });
    return { externalId: out.data.id, externalUrl: `https://x.com/i/web/status/${out.data.id}` };
  },

  async facebook(account, input) {
    const token = await usableAccessToken(account);
    const pageId = account.external_account_id;
    if (input.mediaUrls.length > 0) {
      const out = await call(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
        method: "POST",
        headers: bearer(token),
        body: JSON.stringify({ url: input.mediaUrls[0], caption: input.caption, published: true }),
      });
      return { externalId: out.id, externalUrl: `https://www.facebook.com/${out.id}` };
    }
    const out = await call(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
      method: "POST",
      headers: bearer(token),
      body: JSON.stringify({ message: input.caption, link: input.productUrl ?? undefined }),
    });
    return { externalId: out.id, externalUrl: `https://www.facebook.com/${out.id}` };
  },

  async instagram(account, input) {
    const token = await usableAccessToken(account);
    const igId = account.external_account_id;
    const image = input.mediaUrls.find((u) => !VIDEO_RE.test(u)) ?? input.mediaUrls[0];
    if (!image) throw new Error("Instagram posts require at least one image.");
    const container = await call(`https://graph.facebook.com/v21.0/${igId}/media`, {
      method: "POST",
      headers: bearer(token),
      body: JSON.stringify({
        [VIDEO_RE.test(image) ? "video_url" : "image_url"]: image,
        ...(VIDEO_RE.test(image) ? { media_type: "REELS" } : {}),
        caption: [input.caption, input.productUrl].filter(Boolean).join("\n"),
      }),
    });
    const out = await call(`https://graph.facebook.com/v21.0/${igId}/media_publish`, {
      method: "POST",
      headers: bearer(token),
      body: JSON.stringify({ creation_id: container.id }),
    });
    return { externalId: out.id, externalUrl: `https://www.instagram.com/p/${out.id}` };
  },

  async linkedin(account, input) {
    const token = await usableAccessToken(account);
    const author = `urn:li:person:${account.external_account_id}`;
    const body: Record<string, unknown> = {
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: [input.caption, input.productUrl].filter(Boolean).join("\n"),
          },
          shareMediaCategory: input.mediaUrls.length ? "ARTICLE" : "NONE",
          ...(input.mediaUrls.length
            ? { media: [{ status: "READY", originalUrl: input.mediaUrls[0] }] }
            : {}),
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    };
    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: { ...bearer(token), "X-Restli-Protocol-Version": "2.0.0" },
      body: JSON.stringify(body),
    });
    const id = res.headers.get("x-restli-id");
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !id) throw new Error(`LinkedIn ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
    return { externalId: id, externalUrl: `https://www.linkedin.com/feed/update/${id}` };
  },

  async pinterest(account, input) {
    const token = await usableAccessToken(account);
    const image = input.mediaUrls.find((u) => !VIDEO_RE.test(u));
    if (!image) throw new Error("Pinterest pins require an image.");
    const boards = await call("https://api.pinterest.com/v5/boards?page_size=1", {
      headers: bearer(token),
    });
    const boardId = boards.items?.[0]?.id;
    if (!boardId) throw new Error("No Pinterest board found to pin to. Create a board first.");
    const out = await call("https://api.pinterest.com/v5/pins", {
      method: "POST",
      headers: bearer(token),
      body: JSON.stringify({
        board_id: boardId,
        title: input.caption.slice(0, 100),
        description: input.caption,
        link: input.productUrl ?? undefined,
        media_source: { source_type: "image_url", url: image },
      }),
    });
    return { externalId: out.id, externalUrl: `https://www.pinterest.com/pin/${out.id}` };
  },

  async tiktok(account, input) {
    const token = await usableAccessToken(account);
    const media = input.mediaUrls[0];
    if (!media) throw new Error("TikTok posts require a video or photo URL.");
    const isVideo = VIDEO_RE.test(media);
    const out = await call(
      isVideo
        ? "https://open.tiktokapis.com/v2/post/publish/video/init/"
        : "https://open.tiktokapis.com/v2/post/publish/content/init/",
      {
        method: "POST",
        headers: { ...bearer(token) },
        body: JSON.stringify({
          post_info: {
            title: input.caption.slice(0, 2200),
            privacy_level: "PUBLIC_TO_EVERYONE",
            disable_comment: false,
          },
          source_info: {
            source: "PULL_FROM_URL",
            ...(isVideo ? { video_url: media } : { photo_images: [media], photo_cover_index: 0 }),
          },
          post_mode: "DIRECT_POST",
          media_type: isVideo ? "VIDEO" : "PHOTO",
        }),
      }
    );
    const publishId = out.data?.publish_id;
    if (!publishId) throw new Error(`TikTok did not return a publish id: ${JSON.stringify(out).slice(0, 200)}`);
    return { externalId: publishId };
  },

  async youtube(account, input) {
    const token = await usableAccessToken(account);
    const video = input.mediaUrls.find((u) => VIDEO_RE.test(u));
    if (!video) {
      throw new Error("YouTube publishing requires a video file (mp4/mov) in the post media.");
    }
    const meta = {
      snippet: {
        title: input.caption.slice(0, 100) || "Unsaid product video",
        description: [input.caption, input.productUrl].filter(Boolean).join("\n\n"),
      },
      status: { privacyStatus: "public" },
    };
    const init = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: { ...bearer(token) },
        body: JSON.stringify(meta),
      }
    );
    if (!init.ok) throw new Error(`YouTube upload init failed (${init.status}).`);
    const sessionUrl = init.headers.get("location");
    if (!sessionUrl) throw new Error("YouTube did not return an upload session URL.");
    const bytes = await (await fetch(video)).arrayBuffer();
    const done = await fetch(sessionUrl, { method: "PUT", body: bytes });
    const json = await done.json().catch(() => ({}));
    if (!done.ok || !json.id) throw new Error(`YouTube upload failed (${done.status}).`);
    return { externalId: json.id, externalUrl: `https://www.youtube.com/watch?v=${json.id}` };
  },

  async threads(account, input) {
    const token = await usableAccessToken(account);
    const userId = account.external_account_id;
    const image = input.mediaUrls.find((u) => !VIDEO_RE.test(u));
    const container = await call(`https://graph.threads.net/v1.0/${userId}/threads`, {
      method: "POST",
      headers: bearer(token),
      body: JSON.stringify({
        media_type: image ? "IMAGE" : "TEXT",
        ...(image ? { image_url: image } : {}),
        text: [input.caption, input.productUrl].filter(Boolean).join("\n"),
      }),
    });
    const out = await call(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
      method: "POST",
      headers: bearer(token),
      body: JSON.stringify({ creation_id: container.id }),
    });
    return { externalId: out.id, externalUrl: `https://www.threads.net/t/${out.id}` };
  },
};

export async function publishToNetwork(
  account: SocialAccountRow,
  input: PublishInput
): Promise<PublishResult> {
  const fn = publishers[account.network];
  if (!fn) throw new Error(`No publisher implemented for network "${account.network}".`);
  if (account.status !== "connected") {
    throw new Error("This account is not connected. Reconnect it in Integrations.");
  }
  return fn(account, input);
}
