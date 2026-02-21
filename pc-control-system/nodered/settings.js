module.exports = {
    flowFile: 'flows.json',
    uiPort: process.env.PORT || 1880,
    credentialSecret: process.env.NODE_RED_CREDENTIAL_SECRET || "pc-control-secret",
    httpAdminRoot: '/',
    httpNodeRoot: '/',
    userDir: '/data/',
    functionGlobalContext: {},
    logging: {
        console: {
            level: "info",
            metrics: false,
            audit: false
        }
    }
};
