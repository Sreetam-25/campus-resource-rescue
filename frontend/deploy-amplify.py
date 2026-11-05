import json
import subprocess
import time
import urllib.request

APP_ID = "d3dibxtbw38fiq"
BRANCH = "main"
REGION = "ap-southeast-2"

print(f"1. Checking existing jobs and creating deployment for app {APP_ID}, branch {BRANCH}...")
# Check for any pending job and cancel if needed
jobs_proc = subprocess.run(
    f"aws amplify list-jobs --app-id {APP_ID} --branch-name {BRANCH} --max-results 5 --region {REGION}",
    shell=True,
    capture_output=True,
    text=True
)
if jobs_proc.returncode == 0:
    jobs_data = json.loads(jobs_proc.stdout)
    for j in jobs_data.get("jobSummaries", []):
        if j.get("status") == "PENDING":
            print(f"   Stopping pending job {j['jobId']}...")
            subprocess.run(
                f"aws amplify stop-job --app-id {APP_ID} --branch-name {BRANCH} --job-id {j['jobId']} --region {REGION}",
                shell=True,
                capture_output=True,
                text=True
            )
            time.sleep(2)

create_proc = subprocess.run(
    f"aws amplify create-deployment --app-id {APP_ID} --branch-name {BRANCH} --region {REGION}",
    shell=True,
    capture_output=True,
    text=True
)
if create_proc.returncode != 0:
    print("create-deployment stderr:", create_proc.stderr)
    create_proc.check_returncode()

deployment_info = json.loads(create_proc.stdout)
job_id = deployment_info["jobId"]
upload_url = deployment_info["zipUploadUrl"]
print(f"   Created deployment job_id: {job_id}")

print("2. Uploading dist.zip with application/zip Content-Type...")
with open("dist.zip", "rb") as f:
    zip_data = f.read()

req = urllib.request.Request(
    upload_url,
    data=zip_data,
    headers={"Content-Type": "application/zip"},
    method="PUT"
)

with urllib.request.urlopen(req) as resp:
    print(f"   Artifact upload complete. HTTP Status: {resp.status} {resp.reason}")

print(f"3. Starting deployment for job_id: {job_id}...")
start_proc = subprocess.run(
    f"aws amplify start-deployment --app-id {APP_ID} --branch-name {BRANCH} --job-id {job_id} --region {REGION}",
    shell=True,
    capture_output=True,
    text=True,
    check=True
)
print("   Deployment triggered:", start_proc.stdout)

print("4. Polling deployment job status...")
for i in range(30):
    time.sleep(3)
    status_proc = subprocess.run(
        f"aws amplify get-job --app-id {APP_ID} --branch-name {BRANCH} --job-id {job_id} --region {REGION}",
        shell=True,
        capture_output=True,
        text=True,
        check=True
    )
    job_data = json.loads(status_proc.stdout)
    status = job_data["job"]["summary"]["status"]
    print(f"   Check {i+1}: Job Status = {status}")
    if status == "SUCCEED":
        print("\nDeployment completed successfully!")
        break
    elif status in ["FAILED", "CANCELLED"]:
        raise RuntimeError(f"Amplify deployment failed with status: {status}")
else:
    print("Timed out waiting for deployment to succeed.")
