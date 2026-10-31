import axios from 'axios'

const api = axios.create({
    baseURL: "http://localhost:3000",
    withCredentials: true,
})

/** Generate and persist an interview report. */
export const generateReportApi = async ({ jobDescription, selfDescription, resumeFile }) => {
    const formData = new FormData()
    formData.append("jobDescription", jobDescription)

    if (selfDescription?.trim()) {
        formData.append("selfDescription", selfDescription)
    }
    if (resumeFile) {
        formData.append("resume", resumeFile)
    }

    const response = await api.post("/api/interview/", formData)
    return response.data.interviewReport
}

/** Fetch one report owned by the authenticated user. */
export const getReportByIdApi = async (interviewId) => {
    const response = await api.get(`/api/interview/${encodeURIComponent(interviewId)}`)
    return response.data.interviewReport
}

/** Fetch reports owned by the authenticated user. */
export const getAllReportsApi = async () => {
    const response = await api.get("/api/interview/all")
    return response.data.interviewReports
}
