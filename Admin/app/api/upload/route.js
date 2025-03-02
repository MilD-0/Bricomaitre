import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { isAdmin } from "@/app/lib/auth";

const s3Client = new S3Client({
	region: process.env.AWS_S3_REGION,
	credentials: {
		accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
		secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY,
	}
});


async function uploadFileToS3(file, fileName) {

	const fileBuffer = file;


	const params = {
		Bucket: process.env.AWS_S3_BUCKET_NAME,
		Key: fileName,
		Body: fileBuffer,
		ContentType: "image/jpg"
	}

	const command = new PutObjectCommand(params);
	await s3Client.send(command);
	return fileName;
}

export async function POST(request) {

	try {

		const formData = await request.formData();
		const files = formData.getAll("file");
		console.log(files);
		const uploadedFiles = [];

for (const file of files) {
	const buffer = Buffer.from(await file.arrayBuffer());
		const fileName = await uploadFileToS3(buffer, file.name);
		const link = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${fileName}`
		uploadedFiles.push(link);


}

return NextResponse.json({ success: true, uploadedFiles });



	} catch (error) {
		return NextResponse.json({ error });
	}
}