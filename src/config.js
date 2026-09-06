const DEFAULT_PORT = 8080;

function parsePort(value) {
  const port = Number.parseInt(value ?? String(DEFAULT_PORT), 10);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT 必須是 0 到 65535 之間的整數，目前值為：${value}`);
  }

  return port;
}

export function loadConfig(environment = process.env) {
  const config = {
    appName: environment.APP_NAME?.trim() || "Koino Harbor",
    authProvider: environment.AUTH_PROVIDER?.trim() || "development",
    environment: environment.NODE_ENV?.trim() || "development",
    host: environment.HOST?.trim() || "0.0.0.0",
    port: parsePort(environment.PORT),
    firebaseProjectId: environment.FIREBASE_PROJECT_ID?.trim() || null,
    firebaseApiKey: environment.FIREBASE_API_KEY?.trim() || null,
    firebaseAuthDomain: environment.FIREBASE_AUTH_DOMAIN?.trim() || null,
    firebaseAppId: environment.FIREBASE_APP_ID?.trim() || null,
    firebaseMessagingSenderId: environment.FIREBASE_MESSAGING_SENDER_ID?.trim() || null,
    firebaseStorageBucket: environment.FIREBASE_STORAGE_BUCKET?.trim() || null,
    translationProjectId: environment.TRANSLATION_PROJECT_ID?.trim() || environment.FIREBASE_PROJECT_ID?.trim() || null,
    translationLocation: environment.TRANSLATION_LOCATION?.trim() || "global",
    translationQueueMode: environment.TRANSLATION_QUEUE_MODE?.trim() || ((environment.NODE_ENV?.trim() || "development") === "production" ? "cloud-tasks" : "inline"),
    cloudTasksProjectId: environment.CLOUD_TASKS_PROJECT_ID?.trim() || environment.FIREBASE_PROJECT_ID?.trim() || null,
    cloudTasksLocation: environment.CLOUD_TASKS_LOCATION?.trim() || "asia-east1",
    cloudTasksQueue: environment.CLOUD_TASKS_QUEUE?.trim() || "koino-translations",
    cloudTasksTargetUrl: environment.CLOUD_TASKS_TARGET_URL?.trim() || null,
    cloudTasksAudience: environment.CLOUD_TASKS_AUDIENCE?.trim() || null,
    cloudTasksServiceAccountEmail: environment.CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL?.trim() || null,
    translationTaskMaxAttempts: Number.parseInt(environment.TRANSLATION_TASK_MAX_ATTEMPTS ?? "5", 10),
    sessionSecret: environment.SESSION_SECRET?.trim() || "local-poc-secret-change-before-production",
    seedDevelopmentData: (environment.SEED_DEVELOPMENT_DATA?.trim().toLowerCase() || "true") === "true",
    developmentUsers: [
      {
        email: environment.DEV_ADMIN_EMAIL?.trim() || "admin@koino.local",
        password: environment.DEV_ADMIN_PASSWORD || "PocAdmin123!",
        role: "admin",
      },
      {
        email: environment.DEV_MEMBER_EMAIL?.trim() || "member@koino.local",
        password: environment.DEV_MEMBER_PASSWORD || "PocMember123!",
        role: "member",
      },
      {
        email: environment.DEV_GUEST_EMAIL?.trim() || "guest@koino.local",
        password: environment.DEV_GUEST_PASSWORD || "PocGuest123!",
        role: "guest",
      },
    ],
  };

  if (config.environment === "production" && config.authProvider === "development") {
    throw new Error("正式環境不可使用 development authentication provider。");
  }

  if (config.authProvider === "firebase" && (!config.firebaseProjectId || !config.firebaseApiKey)) {
    throw new Error("Firebase authentication provider 必須設定 FIREBASE_PROJECT_ID 與 FIREBASE_API_KEY。");
  }
  if (!["inline", "cloud-tasks"].includes(config.translationQueueMode)) {
    throw new Error("TRANSLATION_QUEUE_MODE 必須是 inline 或 cloud-tasks。");
  }
  if (!Number.isInteger(config.translationTaskMaxAttempts) || config.translationTaskMaxAttempts < 1) {
    throw new Error("TRANSLATION_TASK_MAX_ATTEMPTS 必須是正整數。");
  }
  if (config.translationQueueMode === "cloud-tasks"
    && (!config.cloudTasksProjectId || !config.cloudTasksLocation || !config.cloudTasksQueue
      || !config.cloudTasksTargetUrl || !config.cloudTasksServiceAccountEmail)) {
    throw new Error("cloud-tasks 翻譯模式必須完整設定 Cloud Tasks 專案、區域、佇列、目標 URL 與服務帳號。");
  }

  return Object.freeze(config);
}

