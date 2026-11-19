# CloudCostIQ – AWS EKS Infrastructure with Terraform

This directory contains the Terraform configuration for provisioning the AWS infrastructure used by CloudCostIQ.

It automates the creation of an AWS VPC, EKS Kubernetes cluster, managed node group, required EKS add-ons, IAM integration for EBS storage, and ArgoCD installation using Helm.

## Architecture

```text
                  Terraform
                      |
                      v
               AWS Infrastructure
                      |
          +-----------+-----------+
          |                       |
          v                       v
         VPC                 EKS Cluster
          |                       |
    +-----+------+          Managed Node Group
    |     |      |                 |
 Public Private Intra          Kubernetes
 Subnets Subnets Subnets           |
                                  v
                         EKS Add-ons
                         - CoreDNS
                         - kube-proxy
                         - VPC CNI
                         - Pod Identity Agent
                         - EBS CSI Driver
                                  |
                                  v
                               ArgoCD
                         Installed using Helm
```

## Technologies Used

| Component | Technology |
|---|---|
| Infrastructure as Code | Terraform |
| Cloud Provider | AWS |
| Kubernetes Service | Amazon EKS |
| Networking | Amazon VPC |
| Compute | EKS Managed Node Groups |
| Storage Integration | AWS EBS CSI Driver |
| IAM Integration | IRSA (IAM Roles for Service Accounts) |
| GitOps / Continuous Delivery | ArgoCD |
| Package Management | Helm |

## Infrastructure Configuration

| Resource | Configuration |
|---|---|
| AWS Region | `us-east-2` |
| EKS Cluster | `cloudcost-eks` |
| Kubernetes Version | `1.35` |
| VPC CIDR | `10.0.0.0/16` |
| Availability Zones | 3 |
| Public Subnets | 3 |
| Private Subnets | 3 |
| Intra Subnets | 3 |
| NAT Gateway | Single NAT Gateway |
| Node Group | `cloudcost-ng` |
| Instance Type | `m7i-flex.large` |
| Desired Nodes | 2 |
| Maximum Nodes | 2 |
| ArgoCD Namespace | `argocd` |
| ArgoCD Service | LoadBalancer |

## Terraform Files

| File | Description |
|---|---|
| `providers.tf` | Defines Terraform requirements, AWS and Helm providers, availability zones, and common local values. |
| `variables.tf` | Declares configurable inputs such as AWS region, cluster name, Kubernetes version, and node configuration. |
| `terraform.tfvars` | Contains the actual values assigned to Terraform variables. |
| `vpc.tf` | Provisions the VPC, public/private/intra subnets, NAT Gateway, and Kubernetes subnet tags. |
| `eks.tf` | Creates the EKS cluster, managed node group, cluster add-ons, EBS CSI IAM role, and EBS CSI add-on. |
| `argocd.tf` | Installs ArgoCD in the EKS cluster using the Helm provider. |
| `outputs.tf` | Exposes useful infrastructure information such as cluster name, endpoint, VPC ID, and kubectl configuration command. |

## Prerequisites

Install the following tools before running Terraform:

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5.7
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) v2
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- [Helm](https://helm.sh/docs/intro/install/) 3
- An AWS account with the required permissions to create VPC, EKS, IAM, EC2, and related resources.

Configure AWS credentials:

```bash
aws configure
```

Verify the AWS identity:

```bash
aws sts get-caller-identity
```

## 1. Initialize Terraform

Navigate to the Terraform directory:

```bash
cd terraform
```

Initialize the required providers and modules:

```bash
terraform init
```

## 2. Format and Validate

Format the Terraform configuration:

```bash
terraform fmt -recursive
```

Validate the configuration:

```bash
terraform validate
```

## 3. Review Infrastructure Plan

Generate an execution plan:

```bash
terraform plan
```

Review the resources Terraform intends to create before proceeding.

## 4. Deploy AWS Infrastructure

Apply the Terraform configuration:

```bash
terraform apply
```

Review the proposed changes and confirm when prompted.

**Note:** Infrastructure creation can take several minutes. AWS resources such as EKS, EC2 instances, NAT Gateway, and LoadBalancers can generate ongoing charges.

## 5. Configure kubectl

After the EKS cluster is created, configure kubectl:

```bash
aws eks update-kubeconfig \
  --region us-east-2 \
  --name cloudcost-eks
```

Verify cluster connectivity:

```bash
kubectl get nodes
```

Check cluster information:

```bash
kubectl cluster-info
```

## 6. Verify EKS Add-ons

Check the installed EKS add-ons:

```bash
aws eks list-addons \
  --cluster-name cloudcost-eks \
  --region us-east-2
```

Check Kubernetes nodes and system pods:

```bash
kubectl get nodes
kubectl get pods -n kube-system
```

## 7. Access ArgoCD

Check the ArgoCD pods:

```bash
kubectl get pods -n argocd
```

Get the ArgoCD service:

```bash
kubectl get svc argocd-server -n argocd
```

Retrieve the LoadBalancer hostname:

```bash
kubectl get svc argocd-server -n argocd \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

Retrieve the initial admin password:

```bash
kubectl get secret argocd-initial-admin-secret \
  -n argocd \
  -o jsonpath='{.data.password}' | base64 -d
```

Default username:

```text
admin
```

**Security note:** The current ArgoCD configuration enables insecure server mode. Do not expose the service publicly without appropriate access restrictions and secure TLS termination.

## 8. Useful Terraform Commands

| Command | Purpose |
|---|---|
| `terraform init` | Initialize Terraform |
| `terraform fmt` | Format configuration files |
| `terraform validate` | Validate configuration syntax |
| `terraform plan` | Preview infrastructure changes |
| `terraform apply` | Create or update infrastructure |
| `terraform output` | Display Terraform outputs |
| `terraform state list` | List tracked resources |
| `terraform destroy` | Delete Terraform-managed infrastructure |

## 9. Cleanup

To remove the infrastructure created by Terraform:

```bash
terraform destroy
```

Review the destruction plan carefully before confirming.

**Important:** Remove Kubernetes resources that provision external AWS LoadBalancers before destroying the VPC. Otherwise, AWS may prevent VPC deletion until those resources are removed.

Also ensure that any resources created outside Terraform are cleaned up separately.

## Project Structure

```text
CloudCostIQ/
│
├── terraform/
│   ├── providers.tf
│   ├── variables.tf
│   ├── terraform.tfvars
│   ├── vpc.tf
│   ├── eks.tf
│   ├── argocd.tf
│   ├── outputs.tf
│   └── README.md
│
├── .github/
│   └── workflows/
│
└── ...
```

## Important Notes

- Terraform manages the AWS infrastructure defined in this directory.
- The EKS cluster uses managed node groups for Kubernetes compute.
- IRSA provides AWS IAM permissions to Kubernetes service accounts.
- The EBS CSI Driver enables Kubernetes workloads to use AWS EBS volumes.
- ArgoCD is installed through Helm to provide GitOps-based continuous delivery.
- Review Terraform plans before applying infrastructure changes.
- Avoid committing AWS credentials, access keys, or sensitive configuration files to GitHub.

---

**CloudCostIQ – Infrastructure as Code using Terraform and AWS EKS.**
