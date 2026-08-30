variable "IMAGE_NAMESPACE" {
  default = "ghcr.io/mild-0/bricomaitre2"
}

variable "SHA_TAG" {
  default = "dev"
}

variable "RELEASE_CHANNEL" {
  default = ""
}

variable "IMAGE_REVISION" {
  default = "unknown"
}

variable "IMAGE_CREATED" {
  default = "unknown"
}

variable "GOOGLE_CLIENT_ID" {
  default = ""
}

variable "BETTER_AUTH_URL" {
  default = ""
}

variable "STOREFRONT_BUILD_API_BASE_URL" {
  default = "https://api.bricomaitre.com"
}

variable "NEXT_PUBLIC_FACEBOOK_PIXEL_ID" {
  default = ""
}

variable "NEXT_PUBLIC_GA_MEASUREMENT_ID" {
  default = ""
}

variable "NEXT_PUBLIC_TIKTOK_PIXEL_ID" {
  default = ""
}

variable "NEXT_PUBLIC_SITE_URL" {
  default = "https://bricomaitre.com"
}

variable "NEXT_PUBLIC_CLOUDFRONT_URL" {
  default = ""
}

variable "NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS" {
  default = ""
}

variable "NEXT_PUBLIC_SENTRY_DSN_STOREFRONT" {
  default = ""
}

variable "NEXT_PUBLIC_SENTRY_DSN_ADMIN" {
  default = ""
}

variable "SENTRY_ORG" {
  default = "bricomaitre"
}

variable "SENTRY_PROJECT_ADMIN" {
  default = "bricadmin"
}

variable "SENTRY_PROJECT_STOREFRONT_API" {
  default = "brico-api"
}

variable "SENTRY_PROJECT_STOREFRONT" {
  default = "storefront"
}

function "release_tags" {
  params = [image]
  result = concat(
    ["${IMAGE_NAMESPACE}/${image}:${SHA_TAG}"],
    RELEASE_CHANNEL != "" ? ["${IMAGE_NAMESPACE}/${image}:${RELEASE_CHANNEL}"] : [],
  )
}

function "registry_cache" {
  params = [image]
  result = "type=registry,ref=${IMAGE_NAMESPACE}/cache-${image}:buildcache"
}

function "registry_cache_max" {
  params = [image]
  result = "${registry_cache(image)},mode=max,image-manifest=true,oci-mediatypes=true"
}

target "_common" {
  context = "."
  args = {
    BRIC_IMAGE_REVISION = IMAGE_REVISION
    BRIC_IMAGE_CREATED  = IMAGE_CREATED
    SENTRY_RELEASE      = IMAGE_REVISION
  }
}

target "_storefront_api" {
  inherits   = ["_common"]
  dockerfile = "ops/docker/Dockerfile.storefront-api"
  args = {
    SENTRY_ORG                    = SENTRY_ORG
    SENTRY_PROJECT_STOREFRONT_API = SENTRY_PROJECT_STOREFRONT_API
  }
  secret = ["id=sentry_auth_token,env=SENTRY_AUTH_TOKEN"]
}

target "storefront-api-web" {
  inherits  = ["_storefront_api"]
  target    = "web"
  tags      = release_tags("storefront-api-web")
  cache-from = [registry_cache("storefront-api-web")]
  cache-to   = [registry_cache_max("storefront-api-web")]
}

target "storefront-api-meta-worker" {
  inherits  = ["_storefront_api"]
  target    = "meta-worker"
  tags      = release_tags("storefront-api-meta-worker")
  cache-from = [registry_cache("storefront-api-meta-worker")]
  cache-to   = [registry_cache_max("storefront-api-meta-worker")]
}

group "api" {
  targets = ["storefront-api-web", "storefront-api-meta-worker"]
}

target "_admin" {
  inherits   = ["_common"]
  dockerfile = "ops/docker/Dockerfile.admin"
  # Every admin image depends on the same expensive `build` stage. Import one
  # full cache for all targets and export it once from the worker target rather
  # than uploading three nearly identical mode=max caches on every release.
  cache-from = [registry_cache("admin-worker")]
  args = {
    GOOGLE_CLIENT_ID        = GOOGLE_CLIENT_ID
    APPLICATION_ORIGIN      = BETTER_AUTH_URL
    NEXT_PUBLIC_SENTRY_DSN_ADMIN = NEXT_PUBLIC_SENTRY_DSN_ADMIN
    SENTRY_ORG              = SENTRY_ORG
    SENTRY_PROJECT_ADMIN    = SENTRY_PROJECT_ADMIN
    STOREFRONT_API_BASE_URL = STOREFRONT_BUILD_API_BASE_URL
  }
  secret = [
    "id=google_client_secret,env=GOOGLE_CLIENT_SECRET",
    "id=better_auth_secret,env=BETTER_AUTH_SECRET",
    "id=sentry_auth_token,env=SENTRY_AUTH_TOKEN",
  ]
}

target "admin-web" {
  inherits  = ["_admin"]
  target    = "web"
  tags      = release_tags("admin-web")
}

target "admin-worker" {
  inherits  = ["_admin"]
  target    = "worker"
  tags      = release_tags("admin-worker")
  cache-to   = [registry_cache_max("admin-worker")]
}

target "admin-migrations" {
  inherits  = ["_admin"]
  target    = "migrations"
  tags      = release_tags("admin-migrations")
}

group "admin" {
  targets = ["admin-web", "admin-worker", "admin-migrations"]
}

target "storefront-web" {
  inherits   = ["_common"]
  dockerfile = "ops/docker/Dockerfile.storefront"
  target     = "runner"
  args = {
    STOREFRONT_API_BASE_URL                                  = STOREFRONT_BUILD_API_BASE_URL
    NEXT_PUBLIC_SITE_URL                                    = NEXT_PUBLIC_SITE_URL
    NEXT_PUBLIC_CLOUDFRONT_URL                              = NEXT_PUBLIC_CLOUDFRONT_URL
    NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS                    = NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS
    NEXT_PUBLIC_FACEBOOK_PIXEL_ID                           = NEXT_PUBLIC_FACEBOOK_PIXEL_ID
    NEXT_PUBLIC_GA_MEASUREMENT_ID                           = NEXT_PUBLIC_GA_MEASUREMENT_ID
    NEXT_PUBLIC_TIKTOK_PIXEL_ID                             = NEXT_PUBLIC_TIKTOK_PIXEL_ID
    NEXT_PUBLIC_RELEASE                                     = SHA_TAG
    NEXT_PUBLIC_SENTRY_DSN_STOREFRONT                   = NEXT_PUBLIC_SENTRY_DSN_STOREFRONT
    NEXT_PUBLIC_SENTRY_ENVIRONMENT                          = "production"
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE_STOREFRONT    = "0.1"
    SENTRY_ORG                                               = SENTRY_ORG
    SENTRY_PROJECT_STOREFRONT                                = SENTRY_PROJECT_STOREFRONT
  }
  secret     = ["id=sentry_auth_token,env=SENTRY_AUTH_TOKEN"]
  tags       = release_tags("storefront-web")
  cache-from = [registry_cache("storefront-web")]
  cache-to   = [registry_cache_max("storefront-web")]
}

group "storefront" {
  targets = ["storefront-web"]
}
