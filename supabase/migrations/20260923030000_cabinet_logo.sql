-- Cabinet logo, shown in the header of printed ordonnances when set.
--
-- Stored inline as an image data URL (resized client-side to a small PNG/JPEG
-- before upload — see src/lib/cabinetLogo.js) rather than in Storage: no bucket
-- or storage policies to maintain, it arrives with the cabinet row the app
-- already loads (profiles -> cabinets(*)), and the print document never has to
-- wait on a network fetch. The check keeps it an actual raster image and small.
--
-- Additive and nullable: no existing row, policy or RPC is affected. Who may
-- change it is governed by the existing cabinets UPDATE policy, same as
-- nom/adresse/telephone.

alter table public.cabinets
  add column if not exists logo_data_url text;

alter table public.cabinets drop constraint if exists cabinets_logo_data_url_check;
alter table public.cabinets add constraint cabinets_logo_data_url_check
  check (
    logo_data_url is null
    or (
      logo_data_url ~ '^data:image/(png|jpeg|webp);base64,'
      and length(logo_data_url) <= 300000
    )
  );

notify pgrst, 'reload schema';
