from fastapi import APIRouter

router = APIRouter()


@router.post("/{job_id}/photos")
async def upload_photos(job_id:int):
        return {
            "message":"photos received"
        }


@router.patch("/{job_id}/location")
async def update_location(job_id:int):
        return {
            "message":"gps updated"
        }


@router.patch("/{job_id}/comment")
async def add_comment(job_id:int):
        return {
            "message":"comment saved"
        }