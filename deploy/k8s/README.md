# Kubernetes Deployment Notes

These manifests show how the Docker Compose services map to a self-hosted cluster:

- frontend Deployment + Service
- backend Deployment + Service
- worker Deployment
- Postgres Deployment + Service + PVC
- Redis Deployment + Service
- ConfigMap and example Secret
- one-shot migration Job
- Ingress with TLS placeholder
- HPA for backend and worker

## Images

The manifests use local placeholder image names:

- `llmtrace-backend:latest`
- `llmtrace-frontend:latest`

For a real self-hosted cluster, build, tag, and push these images to your registry first, then update the `image:` fields in `backend.yaml`, `worker.yaml`, `migration-job.yaml`, and `frontend.yaml`.

Example:

```bash
docker build -t registry.example.com/llmtrace/backend:latest ../../backend
docker build -t registry.example.com/llmtrace/frontend:latest ../../frontend
docker push registry.example.com/llmtrace/backend:latest
docker push registry.example.com/llmtrace/frontend:latest
```

Then replace `llmtrace-backend:latest` and `llmtrace-frontend:latest` in the manifests.

## Migrations

Run `migration-job.yaml` before backend and worker Deployments. The backend and worker containers do not run migrations in Kubernetes; this avoids Alembic races when multiple replicas start at once.

Production gaps to close before real use:

- move secrets to External Secrets or cluster secret manager
- replace placeholder host and secrets
- wire External Secrets or Sealed Secrets
- add Postgres backups
- add Grafana dashboards and alerts
- add rollout and rollback runbooks

Apply order for a self-hosted cluster:

```bash
kubectl apply -f secrets.example.yaml
kubectl apply -f configmap.yaml
kubectl apply -f postgres.yaml
kubectl apply -f redis.yaml
kubectl apply -f migration-job.yaml
kubectl wait --for=condition=complete job/llmtrace-migrate --timeout=120s
kubectl apply -f backend.yaml
kubectl apply -f worker.yaml
kubectl apply -f frontend.yaml
kubectl apply -f hpa.yaml
kubectl apply -f ingress.yaml
```
