"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button, TextField, Spinner } from "@/components/ui";
import { Eyebrow } from "@/components/brand";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const schema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Tell us your name")
    .max(40, "Keep it under 40 characters"),
  dateOfBirth: z
    .string()
    .min(1, "We need your date of birth")
    .refine((v) => {
      const dob = new Date(v);
      if (Number.isNaN(dob.getTime())) return false;
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 18);
      return dob <= cutoff && dob >= new Date("1900-01-01");
    }, "Swoon is for adults 18 and over"),
  city: z
    .string()
    .trim()
    .min(1, "Which city are you in?")
    .max(80, "Keep it under 80 characters"),
});
type FormValues = z.infer<typeof schema>;

export default function ProfileOnboardingPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  // Prefill on revisit so editing doesn't wipe fields.
  useEffect(() => {
    const supabase = supabaseBrowser();
    supabase
      .from("profiles")
      .select("display_name, date_of_birth, city")
      .maybeSingle()
      .then(({ data }) => {
        // Prefill only when a saved profile exists; a late empty response
        // must never wipe what the user is already typing.
        if (data && (data.display_name || data.date_of_birth || data.city)) {
          reset(
            {
              displayName: data.display_name ?? "",
              dateOfBirth: data.date_of_birth ?? "",
              city: data.city ?? "",
            },
            { keepDirtyValues: true },
          );
        }
      });
  }, [reset]);

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    setPhotoError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setPhotoError("Use a JPG, PNG, or WebP image");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError("Photo must be under 5 MB");
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const supabase = supabaseBrowser();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }

    const { error: profileError } = await supabase.rpc("save_profile", {
      p_display_name: values.displayName,
      p_date_of_birth: values.dateOfBirth,
      p_city: values.city,
    });
    if (profileError) {
      setServerError(
        profileError.message.includes("must_be_adult")
          ? "Swoon is for adults 18 and over."
          : "Couldn't save your profile. Check your details and try again.",
      );
      return;
    }

    if (photoFile) {
      const ext = photoFile.type === "image/png" ? "png" : photoFile.type === "image/webp" ? "webp" : "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("profile-photos")
        .upload(path, photoFile, { contentType: photoFile.type });
      if (uploadError) {
        setServerError("Photo upload failed — try a different image.");
        return;
      }
      const { error: photoSaveError } = await supabase.rpc(
        "save_profile_photo",
        { p_photo_path: path },
      );
      if (photoSaveError) {
        setServerError("Couldn't attach your photo. Try again.");
        return;
      }
    } else {
      // Photo is required to complete onboarding.
      const { data: profile } = await supabase
        .from("profiles")
        .select("photo_path")
        .maybeSingle();
      if (!profile?.photo_path) {
        setPhotoError("Add a photo so your dates know it's really you");
        return;
      }
    }

    router.push("/onboarding/verification");
  }

  return (
    <div>
      <Eyebrow className="text-rose-600">Step 1 of 2</Eyebrow>
      <h1 className="mt-3 font-display text-3xl text-charcoal-900">
        Tell us who you are
      </h1>
      <p className="mt-2 text-sm text-charcoal-700/80">
        This is what your dates see when you match. Your date of birth stays
        private — only your age is ever shown.
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-8 flex flex-col gap-5"
        noValidate
      >
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-dashed border-rose-500/50 bg-blush-100 transition-colors hover:border-rose-600"
            aria-label="Add profile photo"
          >
            {photoPreview ? (
              <Image
                src={photoPreview}
                alt="Your profile photo preview"
                fill
                sizes="96px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <span className="flex h-full items-center justify-center text-3xl text-rose-500">
                +
              </span>
            )}
          </button>
          <div>
            <p className="text-sm font-medium text-charcoal-800">
              Profile photo
            </p>
            <p className="text-xs text-charcoal-700/70">
              A clear photo of your face. JPG, PNG or WebP, up to 5 MB.
            </p>
            {photoError && (
              <p role="alert" className="mt-1 text-xs text-danger-600">
                {photoError}
              </p>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={onPickPhoto}
          />
        </div>

        <TextField
          label="First name"
          autoComplete="given-name"
          error={errors.displayName?.message}
          {...register("displayName")}
        />
        <TextField
          label="Date of birth"
          type="date"
          autoComplete="bday"
          hint="Never shown to anyone — we only display your age"
          error={errors.dateOfBirth?.message}
          {...register("dateOfBirth")}
        />
        <TextField
          label="City"
          autoComplete="address-level2"
          hint="Typed by you — Swoon never uses GPS"
          error={errors.city?.message}
          {...register("city")}
        />

        {serverError && (
          <p role="alert" className="text-sm text-danger-600">
            {serverError}
          </p>
        )}

        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : "Continue"}
        </Button>
      </form>
    </div>
  );
}
