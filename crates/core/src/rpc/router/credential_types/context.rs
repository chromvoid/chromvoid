#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(in crate::rpc::router) enum ProviderMatchKind {
    EtldPlusOne,
    Subdomain,
    Exact,
    App,
}

impl ProviderMatchKind {
    pub(in crate::rpc::router) fn as_str(self) -> &'static str {
        match self {
            Self::Exact => "exact",
            Self::Subdomain => "subdomain",
            Self::EtldPlusOne => "etld_plus_one",
            Self::App => "app",
        }
    }
}

#[derive(Debug, Clone)]
pub(in crate::rpc::router) struct ProviderContextWeb {
    pub(in crate::rpc::router) origin_url: url::Url,
    pub(in crate::rpc::router) domain: String,
}

#[derive(Debug, Clone)]
pub(in crate::rpc::router) enum ProviderContext {
    Web(ProviderContextWeb),
    App { app_id: String },
}
