export const DOWNLOADS_URL = "https://downloads.trymetis.email";

export type App = "desktop" | "mobile";

export const latestUrl = (app: App, file: string) => `${DOWNLOADS_URL}/${app}/latest/${file}`;

export const CHECKSUMS: { label: string; app: App }[] = [
  { label: "Desktop checksums", app: "desktop" },
  { label: "Android checksums", app: "mobile" },
];

export type Download = { label: string; format: string; file: string };

export type Platform = {
  name: string;
  note: string;
  app: App;
  files: Download[];
};

export const DOWNLOADS: Platform[] = [
  {
    name: "macOS",
    note: "Apple silicon for Macs with an M-series chip, Intel for older Macs.",
    app: "desktop",
    files: [
      {
        label: "Apple silicon",
        format: ".dmg",
        file: "metis-suite-aarch64-apple-darwin.dmg",
      },
      {
        label: "Intel",
        format: ".dmg",
        file: "metis-suite-x86_64-apple-darwin.dmg",
      },
    ],
  },
  {
    name: "Windows",
    note: "x64 for most PCs, Arm for Snapdragon and other Arm laptops.",
    app: "desktop",
    files: [
      {
        label: "x64",
        format: "Installer",
        file: "metis-suite-x86_64-pc-windows-msvc.exe",
      },
      {
        label: "Arm",
        format: "Installer",
        file: "metis-suite-aarch64-pc-windows-msvc.exe",
      },
    ],
  },
  {
    name: "Linux",
    note: ".deb for Debian and Ubuntu, .rpm for Fedora, RHEL and openSUSE.",
    app: "desktop",
    files: [
      {
        label: "x64",
        format: ".deb",
        file: "metis-suite-x86_64-unknown-linux-gnu.deb",
      },
      {
        label: "Arm64",
        format: ".deb",
        file: "metis-suite-aarch64-unknown-linux-gnu.deb",
      },
      {
        label: "x64",
        format: ".rpm",
        file: "metis-suite-x86_64-unknown-linux-gnu.rpm",
      },
      {
        label: "Arm64",
        format: ".rpm",
        file: "metis-suite-aarch64-unknown-linux-gnu.rpm",
      },
    ],
  },
  {
    name: "Android",
    note: "One APK for every Android phone. There is no iPhone app.",
    app: "mobile",
    files: [
      {
        label: "Android",
        format: "APK",
        file: "metis-suite-universal-linux-android.apk",
      },
    ],
  },
];
