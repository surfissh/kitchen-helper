{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM"],
    "types": [],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "paths": {
      "@irisview/osx/fusionui": ["__KIT_PATH__/sdk/public-api/index.d.ts"],
      "@irisview/osx/os": ["__KIT_PATH__/sdk/public-api/os/index.d.ts"],
      "@irisview/osx/os/*": ["__KIT_PATH__/sdk/public-api/os/*"],
      "@fusionui/sdk-support": ["__KIT_PATH__/sdk/public-api/sdk-support.d.ts"]
    }
  },
  "include": [
    "app-src/**/*.ts",
    "tests/**/*.ts",
    "__KIT_PATH__/sdk/public-api/sdk-support.d.ts"
  ]
}
