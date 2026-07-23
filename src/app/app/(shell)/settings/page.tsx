"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button, Card, TextField, Spinner } from "@/components/ui";
import { Eyebrow } from "@/components/brand";
import type { MyProfile } from "@/lib/domain/types";

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    supabase
      .from("profiles")
      .select("*")
      .maybeSingle<MyProfile>()
      .then(async ({ data }) => {
        if (!data) return;
        setProfile(data);
        setName(data.display_name ?? "");
        setCity(data.city ?? "");
        if (data.photo_path) {
          const { data: signed } = await supabase.storage
            .from("profile-photos")
            .createSignedUrl(data.photo_path, 600);
          if (signed) setPhotoUrl(signed.signedUrl);
        }
      });
  }, []);

  async function saveProfile() {
    if (!profile?.date_of_birth) return;
    setBusy("profile");
    setProfileMsg(null);
    const { error } = await supabaseBrowser().rpc("save_profile", {
      p_display_name: name,
      p_date_of_birth: profile.date_of_birth,
      p_city: city,
    });
    setBusy(null);
    setProfileMsg(error ? "Couldn't save — check your details." : "Saved.");
  }

  async function changePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    if (file.size > 5 * 1024 * 1024) {
      setProfileMsg("Photo must be under 5 MB.");
      return;
    }
    setBusy("photo");
    const supabase = supabaseBrowser();
    const ext =
      file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${profile.user_id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("profile-photos")
      .upload(path, file, { contentType: file.type });
    if (!upErr) {
      await supabase.rpc("save_profile_photo", { p_photo_path: path });
      const { data: signed } = await supabase.storage
        .from("profile-photos")
        .createSignedUrl(path, 600);
      if (signed) setPhotoUrl(signed.signedUrl);
      setProfileMsg("Photo updated.");
    } else {
      setProfileMsg("Upload failed — try a different image.");
    }
    setBusy(null);
  }

  async function changePassword() {
    if (password.length < 10) {
      setPasswordMsg("Use at least 10 characters.");
      return;
    }
    setBusy("password");
    setPasswordMsg(null);
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    setBusy(null);
    setPasswordMsg(error ? "Couldn't update password." : "Password updated.");
    if (!error) setPassword("");
  }

  async function deleteAccount() {
    setBusy("delete");
    const res = await fetch("/api/account/delete", { method: "POST" });
    if (res.ok) {
      await supabaseBrowser().auth.signOut();
      router.replace("/");
      router.refresh();
    } else {
      setBusy(null);
      setConfirmDelete(false);
    }
  }

  if (!profile) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-6 w-6 text-rose-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <Eyebrow className="text-rose-600">Settings</Eyebrow>
      <h1 className="mt-2 font-display text-4xl text-charcoal-900">
        Your account
      </h1>

      <Card className="mt-8 p-6">
        <h2 className="font-display text-xl text-charcoal-900">Profile</h2>
        <div className="mt-5 flex items-center gap-5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative h-20 w-20 overflow-hidden rounded-full border-2 border-blush-300 transition-colors hover:border-rose-500"
            aria-label="Change profile photo"
          >
            {photoUrl ? (
              <Image src={photoUrl} alt="" fill sizes="80px" className="object-cover" unoptimized />
            ) : (
              <span className="flex h-full items-center justify-center bg-blush-100 font-display text-2xl text-rose-500">
                {name[0] ?? "?"}
              </span>
            )}
            {busy === "photo" && (
              <span className="absolute inset-0 flex items-center justify-center bg-ink-990/50">
                <Spinner className="h-5 w-5 text-cream-100" />
              </span>
            )}
          </button>
          <p className="text-xs text-charcoal-700/70">
            Tap the photo to change it.
            <br />
            Your age ({profile.date_of_birth ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / 3.15576e10) : "—"}) is calculated from your date of birth and can&apos;t be edited.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={changePhoto}
          />
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <TextField
            label="First name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
          />
          <TextField
            label="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            maxLength={80}
          />
          {profileMsg && (
            <p className="text-sm text-charcoal-700/80" role="status">
              {profileMsg}
            </p>
          )}
          <Button onClick={saveProfile} disabled={busy === "profile"} className="self-start">
            {busy === "profile" ? <Spinner /> : "Save changes"}
          </Button>
        </div>
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="font-display text-xl text-charcoal-900">Password</h2>
        <div className="mt-4 flex flex-col gap-4">
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="At least 10 characters"
          />
          {passwordMsg && (
            <p className="text-sm text-charcoal-700/80" role="status">
              {passwordMsg}
            </p>
          )}
          <Button
            onClick={changePassword}
            disabled={busy === "password"}
            className="self-start"
          >
            {busy === "password" ? <Spinner /> : "Update password"}
          </Button>
        </div>
      </Card>

      <Card className="mt-6 border-danger-600/25 p-6">
        <h2 className="font-display text-xl text-charcoal-900">
          Delete account
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-charcoal-700/80">
          Permanently removes your profile, photo, matches, and messages.
          There&apos;s no undo.
        </p>
        <Button
          variant="danger"
          className="mt-4"
          onClick={() => setConfirmDelete(true)}
        >
          Delete my account
        </Button>
      </Card>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-990/60 px-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[--radius-soft] bg-cream-50 p-6 shadow-float">
            <h2 className="font-display text-2xl text-charcoal-900">
              Delete everything?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-charcoal-700/80">
              Your profile, matches, and conversations will be gone for good.
            </p>
            <div className="mt-5 flex gap-2.5">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmDelete(false)}
                disabled={busy === "delete"}
              >
                Keep my account
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={deleteAccount}
                disabled={busy === "delete"}
              >
                {busy === "delete" ? <Spinner /> : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
