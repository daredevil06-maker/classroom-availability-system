import { useState } from "react";
import AdminDashboard from "./AdminDashboard";
import HodDashboard from "./HodDashboard";

function App() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [user, setUser] = useState(null);
    const [message, setMessage] = useState("");
    const [cancelModalRequest, setCancelModalRequest] = useState(null);
    const [isCancelling, setIsCancelling] = useState(false);

    const [date, setDate] = useState("");
    const [startTime, setStartTime] = useState("");
    const [endTime, setEndTime] = useState("");
    const [classrooms, setClassrooms] = useState([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    const [activityType, setActivityType] = useState("Hackathon");
    const [participants, setParticipants] = useState("");
    
    const [reason, setReason] = useState("");
    const [requestMessage, setRequestMessage] = useState("");
    const [allocationResult, setAllocationResult] = useState(null);

    const [allocations, setAllocations] = useState([]);
    const [loadingAllocations, setLoadingAllocations] = useState(false);

    const [myTimetable, setMyTimetable] = useState([]);
    const [loadingTimetable, setLoadingTimetable] = useState(false);
    const [activeTeacherTab, setActiveTeacherTab] = useState("availability");


    // LOGIN
    const handleLogin = async (e) => {
        e.preventDefault();

        try {
            const response = await fetch(
                "http://localhost:5000/api/auth/login",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        email,
                        password
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setMessage(data.message);
                return;
            }

            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));

            setUser(data.user);
            setMessage("");

        } catch (error) {
            setMessage("Unable to connect to server");
        }
    };


    // CHECK AVAILABILITY
    const checkAvailability = async () => {

        if (!date || !startTime || !endTime) {
            setMessage("Please select date and time");
            return;
        }

        setLoading(true);
        setMessage("");
        setClassrooms([]);
        setHasSearched(true);

        try {

            const token = localStorage.getItem("token");

            const response = await fetch(
                `http://localhost:5000/api/classrooms/available?date=${date}&start_time=${startTime}&end_time=${endTime}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setMessage(data.message);
                return;
            }

            setClassrooms(data.available_classrooms);

        } catch (error) {
            setMessage("Unable to check classroom availability");
        } finally {
            setLoading(false);
        }
    };


    // SUBMIT REQUEST
    const submitRequest = async () => {

        if (!date || !startTime || !endTime) {
            setRequestMessage("Please select date and time");
            return;
        }

        if (!activityType) {
            setRequestMessage("Please select an activity type");
            return;
        }

        if (!participants || Number(participants) <= 0) {
            setRequestMessage("Please enter the number of participants");
            return;
        }

        setRequestMessage("");
        setAllocationResult(null);

        try {

            const token = localStorage.getItem("token");

            const response = await fetch(
                "http://localhost:5000/api/requests",
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },

                    body: JSON.stringify({
                        request_date: date,
                        start_time: startTime,
                        end_time: endTime,
                        activity_type: activityType,
                        reason: reason,
                        participants: Number(participants),
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                if (
                    data.message === "Unable to allocate enough suitable classrooms." ||
                    data.message === "No suitable classrooms are available."
                ) {
                    setRequestMessage("No suitable room available in this timing or day. Search in another timing.");
                } else {
                    setRequestMessage(data.message);
                }
                return;
            }

            setAllocationResult(data);
            setRequestMessage("");

            setReason("");
            setParticipants("");

            // Refresh allocations and navigate to My Allocations tab
            await loadAllocations();
            setActiveTeacherTab("allocations");
            window.scrollTo({ top: 0, behavior: "smooth" });

        } catch (error) {

            console.error(error);

            setRequestMessage(
                "Unable to submit classroom request"
            );
        }
    };


    // LOAD MY ALLOCATIONS
    const loadAllocations = async () => {

        setLoadingAllocations(true);

        try {

            const token = localStorage.getItem("token");

            const response = await fetch(
                "http://localhost:5000/api/requests/my",
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setMessage(data.message);
                return;
            }

            setAllocations(data.allocations);

        } catch (error) {

            setMessage("Unable to load allocations");

        } finally {

            setLoadingAllocations(false);
        }
    };

    // TEACHER CANCEL OWN APPROVED REQUEST
    const cancelApprovedRequest = async (requestId) => {
        setIsCancelling(true);
        try {
            const token = localStorage.getItem("token");
            const response = await fetch(
                `http://localhost:5000/api/requests/${requestId}/cancel-own`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setRequestMessage(data.message || "Unable to cancel request");
                return;
            }

            setRequestMessage("Classroom request cancelled successfully. All classrooms released and immediately available.");
            setCancelModalRequest(null);
            await loadAllocations();

        } catch (error) {
            console.error(error);
            setRequestMessage("Unable to cancel classroom request");
        } finally {
            setIsCancelling(false);
        }
    };

    // ACCEPT REASSIGNMENT
    const acceptReassignment = async (requestId) => {
    try {
        const token = localStorage.getItem("token");

        const response = await fetch(
            `http://localhost:5000/api/requests/reassignments/${requestId}/accept`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {
            setRequestMessage(data.message || "Unable to accept classroom");
            return;
        }

        setRequestMessage("Alternative classroom accepted successfully.");
        loadAllocations();

    } catch (error) {
        console.error(error);
        setMessage("Unable to accept classroom reassignment");
    }
};


// REJECT REASSIGNMENT
const rejectReassignment = async (requestId) => {
    try {
        const token = localStorage.getItem("token");

        const response = await fetch(
            `http://localhost:5000/api/requests/reassignments/${requestId}/reject`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {
            setRequestMessage(data.message || "Unable to reject classroom");
            return;
        }

        setRequestMessage("Alternative classroom rejected.");
        loadAllocations();

    } catch (error) {
        console.error(error);
        setMessage("Unable to reject classroom reassignment");
    }
};

const searchAnotherClassroom = async (request) => {
    const requestDate = String(request.request_date).slice(0, 10);
    const requestStartTime = String(request.start_time).slice(0, 5);
    const requestEndTime = String(request.end_time).slice(0, 5);
    const requestActivityType = request.activity_type || "";
    const requestParticipants = Number(request.participants) || 0;

    // Fill the Availability fields
    setDate(requestDate);
    setStartTime(requestStartTime);
    setEndTime(requestEndTime);

    // Open Availability tab
    setActiveTeacherTab("availability");

    // Clear old results
    setClassrooms([]);
    setMessage("");
    setHasSearched(true);

    // Search available classrooms
    setLoading(true);

    try {
        const token = localStorage.getItem("token");

        const response = await fetch(
            `http://localhost:5000/api/classrooms/available?date=${requestDate}&start_time=${requestStartTime}&end_time=${requestEndTime}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {
            setMessage(
                data.message || "Unable to check classroom availability"
            );
            return;
        }

        const rawRooms = data.available_classrooms || [];

        // Check computer requirement for activity
        const isProgramming = ["programming", "coding", "software", "computer"].some(kw =>
            requestActivityType.toLowerCase().includes(kw)
        );

        // Filter suitable rooms satisfying the original request's requirements
        const suitableRooms = rawRooms.filter(room => {
            if (Number(room.capacity) <= 0) return false;
            if (requestParticipants > 0 && Number(room.capacity) < requestParticipants) return false;
            if (isProgramming && !room.computers) return false;
            return true;
        });

        setClassrooms(suitableRooms);
        window.scrollTo({ top: 0, behavior: "smooth" });

    } catch (error) {
        console.error("Search classroom error:", error);
        setMessage("Unable to check classroom availability");
    } finally {
        setLoading(false);
    }
};

const chooseAnotherDateTime = (request) => {
    setActivityType(request.activity_type || "Hackathon");
    setParticipants(request.participants ? String(request.participants) : "");
    setReason(request.reason || "");
    setDate("");
    setStartTime(request.start_time ? String(request.start_time).slice(0, 5) : "");
    setEndTime(request.end_time ? String(request.end_time).slice(0, 5) : "");
    setRequestMessage("");
    setAllocationResult(null);
    setActiveTeacherTab("request");
    window.scrollTo({ top: 0, behavior: "smooth" });
};
    // LOAD MY TIMETABLE
    const loadMyTimetable = async () => {

        setLoadingTimetable(true);

        try {

            const token = localStorage.getItem("token");

            const response = await fetch(
                "http://localhost:5000/api/requests/my-timetable",
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setMessage(data.message);
                return;
            }

            setMyTimetable(data.timetable);

        } catch (error) {

            console.error("My timetable error:", error);
            setMessage("Unable to load timetable");

        } finally {

            setLoadingTimetable(false);

        }
    };


    // LOGOUT
    const handleLogout = () => {

        localStorage.removeItem("token");
        localStorage.removeItem("user");

        setUser(null);
        setClassrooms([]);
        setAllocations([]);
        setDate("");
        setStartTime("");
        setEndTime("");
    };


    // DASHBOARD
    if (user) {

      // ADMIN DASHBOARD
      if (user.role === "ADMIN") {
          return (
              <AdminDashboard
                  user={user}
                  onLogout={handleLogout}
              />
          );
      }

      // HOD DASHBOARD
      if (user.role === "HOD") {
          return (
              <HodDashboard
                  user={user}
                  onLogout={handleLogout}
              />
          );
      }
        return (
            <div className="min-h-screen bg-gray-100">

                {/* NAVBAR */}
                <nav className="bg-blue-600 text-white px-8 py-4 flex justify-between items-center">

                    <h1 className="text-xl font-bold">
                        Classroom Allocation System
                    </h1>

                    <div className="flex items-center gap-4">

                        <span>
                            {user.name}
                        </span>

                        <button
                            onClick={handleLogout}
                            className="bg-white text-blue-600 px-4 py-2 rounded-lg font-semibold"
                        >
                            Logout
                        </button>

                    </div>

                </nav>


                <main className="max-w-5xl mx-auto p-8">

                    <h2 className="text-3xl font-bold">
                        Teacher Dashboard
                    </h2>

                    <p className="text-gray-600 mt-1 mb-8">
                        Find and allocate an available classroom
                    </p>

                    {/* TEACHER TABS */}
                    <div className="flex flex-wrap gap-2 mb-6 bg-white p-2 rounded-xl shadow">

                        <button
                            onClick={() => setActiveTeacherTab("availability")}
                            className={
                                activeTeacherTab === "availability"
                                    ? "bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold"
                                    : "bg-gray-100 px-5 py-2 rounded-lg font-semibold"
                            }
                        >
                            Availability
                        </button>

                        <button
                            onClick={() => setActiveTeacherTab("request")}
                            className={
                                activeTeacherTab === "request"
                                    ? "bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold"
                                    : "bg-gray-100 px-5 py-2 rounded-lg font-semibold"
                            }
                        >
                            Request Classroom
                        </button>


                        <button
                            onClick={() => {
                                setActiveTeacherTab("timetable");
                                loadMyTimetable();
                            }}
                            className={
                                activeTeacherTab === "timetable"
                                    ? "bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold"
                                    : "bg-gray-100 px-5 py-2 rounded-lg font-semibold"
                            }
                        >
                            My Timetable
                        </button>


                        <button
                            onClick={() => {
                                setActiveTeacherTab("allocations");
                                loadAllocations();
                            }}
                            className={
                                activeTeacherTab === "allocations"
                                    ? "bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold"
                                    : "bg-gray-100 px-5 py-2 rounded-lg font-semibold"
                            }
                        >
                            My Allocations
                        </button>

                    </div>


                    {/* AVAILABILITY TAB */}
{activeTeacherTab === "availability" && (
    <>
        {/* SEARCH */}
        <div className="bg-white rounded-xl shadow p-6">

            <h3 className="text-xl font-semibold mb-6">
                Check Classroom Availability
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                <div>
                    <label className="block font-medium mb-2">
                        Date
                    </label>

                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full border rounded-lg px-4 py-2"
                    />
                </div>


                <div>
                    <label className="block font-medium mb-2">
                        Start Time
                    </label>

                    <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full border rounded-lg px-4 py-2"
                    />
                </div>


                <div>
                    <label className="block font-medium mb-2">
                        End Time
                    </label>

                    <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full border rounded-lg px-4 py-2"
                    />
                </div>

            </div>


            <button
                onClick={checkAvailability}
                className="mt-6 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700"
            >
                {loading ? "Checking..." : "Check Availability"}
            </button>

        </div>


        {/* NO CLASSROOMS FOUND MESSAGE */}
        {hasSearched && !loading && classrooms.length === 0 && (
            <div className="mt-8 bg-amber-50 border border-amber-300 rounded-xl p-6 text-center">
                <h4 className="text-xl font-bold text-amber-800 mb-2">
                    ⚠️ No Available Classrooms Found
                </h4>
                <p className="text-amber-700">
                    No operational classrooms are free for the selected date ({date}) and time ({startTime} - {endTime}).
                    Please try selecting a different date or time window above.
                </p>
            </div>
        )}


        {/* AVAILABLE CLASSROOMS */}
        {classrooms.length > 0 && (

            <div className="mt-8">

                <h3 className="text-2xl font-bold mb-4">
                    Available Classrooms
                </h3>


                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

                    {classrooms.map((room) => (

                        <div
                            key={room.classroom_id}
                            className="bg-white rounded-xl shadow p-5 border-l-4 border-green-500 flex flex-col justify-between"
                        >

                            <div>
                                <div className="flex justify-between">

                                    <h4 className="text-xl font-bold">
                                        {room.room_number}
                                    </h4>

                                    <span className="text-green-600 font-semibold">
                                        Available
                                    </span>

                                </div>


                                <p className="text-gray-600 mt-3">
                                    {room.building}
                                </p>


                                <p className="text-gray-600">
                                    Capacity: {room.capacity}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    setActiveTeacherTab("request");
                                    setRequestMessage(
                                        `Selected classroom: ${room.building} ${room.room_number} (Capacity: ${room.capacity}). Complete request details below and click Allocate Classroom.`
                                    );
                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                                className="mt-4 w-full bg-green-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-green-700 transition text-center"
                            >
                                Request / Allocate This Room
                            </button>

                        </div>

                    ))}

                </div>

            </div>

        )}

    </>
)}


{/* REQUEST CLASSROOM TAB */}
{activeTeacherTab === "request" && (

    <div className="mt-8 bg-white rounded-xl shadow p-6">

        <h3 className="text-2xl font-bold mb-6">
            Request Classroom
        </h3>

        {/* DATE AND TIME */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">

    <div>
        <label className="block font-medium mb-2">
            Date
        </label>

        <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border rounded-lg px-4 py-2"
        />
    </div>

    <div>
        <label className="block font-medium mb-2">
            Start Time
        </label>

        <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full border rounded-lg px-4 py-2"
        />
    </div>

    <div>
        <label className="block font-medium mb-2">
            End Time
        </label>

        <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full border rounded-lg px-4 py-2"
        />
    </div>

</div>


        {/* ACTIVITY TYPE */}
        <div className="mb-5">

            <label className="block font-medium mb-2">
                Activity Type
            </label>

            <select
                value={activityType}
                onChange={(e) =>
                    setActivityType(e.target.value)
                }
                className="w-full border rounded-lg px-4 py-2"
            >
                <option>Hackathon</option>
                <option>Coding Hackathon</option>
                <option>External Event</option>
                <option>Seminar</option>
                <option>HOD Meeting</option>
                <option>Faculty Activity</option>
                <option>Extra Class</option>
                <option>Programming Workshop</option>
                <option>Other</option>
            </select>

        </div>


        {/* PARTICIPANTS */}
        <div className="mb-5">

            <label className="block font-medium mb-2">
                Number of Participants
            </label>

            <input
                type="number"
                min="1"
                value={participants}
                onChange={(e) =>
                    setParticipants(e.target.value)
                }
                placeholder="Enter number of participants"
                className="w-full border rounded-lg px-4 py-2"
            />

        </div>


        {/* REASON */}
        <div className="mb-5">

            <label className="block font-medium mb-2">
                Reason
            </label>

            <textarea
                value={reason}
                onChange={(e) =>
                    setReason(e.target.value)
                }
                placeholder="Enter reason"
                className="w-full border rounded-lg px-4 py-2"
                rows="3"
            />

        </div>


        {/* ALLOCATE */}
        <button
            onClick={submitRequest}
            className="bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700"
        >
            Allocate Classroom
        </button>


        {/* REQUEST MESSAGE / ERROR / INFO */}
        {requestMessage && (
            <div className={`mt-5 p-4 rounded-lg font-semibold border ${requestMessage.includes("Selected classroom:") || requestMessage.includes("Select a new date") ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-red-50 border-red-300 text-red-700"}`}>
                {requestMessage}
            </div>
        )}


        {/* ALLOCATION RESULT */}
        {allocationResult && (

            <div className="mt-6 border rounded-xl p-5 bg-green-50">

                <h4 className="text-xl font-bold text-green-700 mb-4">
                    ✅ Classroom Allocated Successfully
                </h4>


                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">

                    <div>
                        <p className="text-gray-500">
                            Activity
                        </p>

                        <p className="font-semibold">
                            {allocationResult.request.activity_type}
                        </p>
                    </div>


                    <div>
                        <p className="text-gray-500">
                            Participants
                        </p>

                        <p className="font-semibold">
                            {allocationResult.participants}
                        </p>
                    </div>


                    <div>
                        <p className="text-gray-500">
                            Priority
                        </p>

                        <p className="font-semibold">
                            {allocationResult.priority}
                        </p>
                    </div>


                    <div>
                        <p className="text-gray-500">
                            Allocation Type
                        </p>

                        <p className="font-semibold">
                            {allocationResult.allocation_type === "SINGLE_ROOM"
                                ? "Single Room"
                                : "Multiple Rooms"}
                        </p>
                    </div>

                </div>


                {/* ROOMS */}
                <h5 className="font-bold mb-3">
                    Allocated Classrooms
                </h5>


                <div className="space-y-2">

                    {allocationResult.rooms.map((room) => (

                        <div
                            key={room.classroom_id}
                            className="bg-white border rounded-lg px-4 py-3 flex justify-between"
                        >

                            <div>

                                <span className="font-semibold">
                                    {room.building} {room.room_number}
                                </span>

                                <span className="text-gray-500 ml-3">
                                    {room.room_type}
                                </span>

                            </div>


                            <span className="text-gray-600">
                                Capacity: {room.capacity}
                            </span>

                        </div>

                    ))}

                </div>


                {/* CAPACITY */}
                <div className="grid grid-cols-3 gap-4 mt-5 border-t pt-4">

                    <div>

                        <p className="text-gray-500">
                            Total Rooms
                        </p>

                        <p className="font-bold">
                            {allocationResult.rooms.length}
                        </p>

                    </div>


                    <div>

                        <p className="text-gray-500">
                            Total Capacity
                        </p>

                        <p className="font-bold">
                            {allocationResult.total_capacity}
                        </p>

                    </div>


                    <div>

                        <p className="text-gray-500">
                            Unused Capacity
                        </p>

                        <p className="font-bold">
                            {allocationResult.unused_capacity}
                        </p>

                    </div>

                </div>


                {/* EXPLANATION */}
                <div className="mt-5 bg-white border rounded-lg p-4">

                    <h5 className="font-bold mb-2">
                        Why were these classrooms selected?
                    </h5>

                    <p className="text-gray-700">
                        {allocationResult.explanation}
                    </p>

                </div>


                {/* REJECTED LOWER PRIORITY REQUESTS */}
                {allocationResult.rejected_requests &&
                    allocationResult.rejected_requests.length > 0 && (

                    <div className="mt-5 bg-yellow-50 border border-yellow-300 rounded-lg p-4">

                        <h5 className="font-bold text-yellow-800 mb-2">
                            Priority Conflict Resolution
                        </h5>

                        <p className="text-gray-700">
                            A lower-priority allocation was replaced because
                            this activity has a higher priority.
                        </p>

                    </div>

                )}

            </div>

                )}

            </div>

        )}

        {/* MY TIMETABLE */}
        {activeTeacherTab === "timetable" && (

            <div className="mt-8 bg-white rounded-xl shadow p-6">

                <div className="flex justify-between items-center mb-6">

                    <div>
                        <h3 className="text-2xl font-bold">
                            My Timetable
                        </h3>

                        <p className="text-gray-500">
                            View your regular theory and lab schedule.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <input
                            type="file"
                            id="teacher-excel-timetable-input"
                            accept=".xlsx, .xls, .csv"
                            className="hidden"
                            onChange={() => {}}
                        />
                        <button
                            type="button"
                            onClick={() => {
                                document.getElementById("teacher-excel-timetable-input")?.click();
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition shadow-sm text-sm"
                            title="Upload timetable Excel sheet (.xlsx, .xls)"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>Upload Timetable (Excel)</span>
                        </button>

                        <button
                            onClick={loadMyTimetable}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-semibold transition text-sm"
                        >
                            {loadingTimetable
                                ? "Loading..."
                                : "Refresh"}
                        </button>
                    </div>

                </div>


                {myTimetable.length === 0 && !loadingTimetable && (

                    <p className="text-gray-500">
                        No timetable entries found.
                    </p>

                )}


                <div className="space-y-4">

                    {myTimetable.map((item) => (

                        <div
                            key={item.timetable_id}
                            className="border rounded-xl p-5"
                        >

                            <div className="flex justify-between items-start">

                                <div>

                                    <h4 className="text-xl font-bold">
                                        {item.subject}
                                    </h4>

                                    <p className="text-gray-500 mt-1">
                                        {item.schedule_type}
                                    </p>

                                </div>

                                <span className="font-semibold text-blue-600">
                                    {item.slot_code}
                                </span>

                            </div>


                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 text-gray-600">

                                <p>
                                    <strong>Day:</strong><br />
                                    {item.day_of_week}
                                </p>


                                <p>
                                    <strong>Time:</strong><br />
                                    {String(item.start_time).slice(0, 5)}
                                    {" - "}
                                    {String(item.end_time).slice(0, 5)}
                                </p>


                                <p>
                                    <strong>Classroom:</strong><br />
                                    {item.building} {item.room_number}
                                </p>


                                <p>
                                    <strong>Room Type:</strong><br />
                                    {item.room_type}
                                </p>

                            </div>

                        </div>

                    ))}

                </div>

            </div>

        )}


{/* MY ALLOCATIONS */}
{activeTeacherTab === "allocations" && (
    <div className="mt-8 bg-white rounded-xl shadow p-6">

        <div className="flex justify-between items-center mb-5">

            <div>
                <h3 className="text-2xl font-bold">
                    My Allocations
                </h3>

                <p className="text-gray-500">
                    View your allocated classrooms (newest allocations shown first)
                </p>
            </div>

            <button
                onClick={loadAllocations}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-blue-700 transition"
            >
                {loadingAllocations
                    ? "Loading..."
                    : "Refresh"}
            </button>

        </div>

        {/* ALLOCATION SUCCESS BANNER IF JUST ALLOCATED */}
        {allocationResult && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 flex justify-between items-start shadow-sm">
                <div>
                    <p className="font-bold flex items-center gap-2 text-base text-emerald-800">
                        <span>✅</span> Classroom Allocated Successfully!
                    </p>
                    <p className="text-xs text-emerald-700 mt-1">
                        {allocationResult.explanation || `Your request #${allocationResult.request?.request_id} has been approved and allocated below.`}
                    </p>
                </div>
                <button
                    onClick={() => setAllocationResult(null)}
                    className="text-emerald-600 hover:text-emerald-900 font-bold text-sm px-2 py-1"
                >
                    ✕
                </button>
            </div>
        )}

        {allocations.length === 0 && !loadingAllocations && (
            <p className="text-gray-500">
                No allocations found.
            </p>
        )}


                        {/* GROUP ALLOCATIONS BY REQUEST */}
                        {Object.values(
                            allocations.reduce((groups, item) => {

                                if (!groups[item.request_id]) {
                                    groups[item.request_id] = {
                                        ...item,
                                        rooms: []
                                    };
                                }

                                groups[item.request_id].rooms.push(item);

                                return groups;

                            }, {})
                        )
                        .sort((a, b) => Number(b.request_id) - Number(a.request_id))
                        .map((request) => (

                            <div
                                key={request.request_id}
                                className="border border-gray-200 bg-white rounded-xl p-6 mb-5 shadow-sm"
                            >

                                {/* REQUEST HEADER */}
                                <div className="flex flex-wrap justify-between items-center gap-3">

                                    <div>
                                        <h4 className="text-xl font-bold text-gray-900">
                                            {request.activity_type}
                                        </h4>

                                        <p className="text-gray-500 text-sm">
                                            Request ID: #{request.request_id}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                            request.status === "APPROVED" ? "bg-green-100 text-green-800" :
                                            request.status === "HOD_REASSIGNMENT_PENDING" ? "bg-amber-100 text-amber-800 animate-pulse" :
                                            request.status === "REASSIGNMENT_REJECTED" ? "bg-rose-100 text-rose-800" :
                                            request.status === "CANCELLED" ? "bg-gray-100 text-gray-700" :
                                            "bg-blue-100 text-blue-800"
                                        }`}>
                                            {request.status === "HOD_REASSIGNMENT_PENDING" ? "REASSIGNMENT SUGGESTED" : request.status}
                                        </span>

                                        {request.status === "APPROVED" && (
                                            <button
                                                onClick={() => setCancelModalRequest(request)}
                                                className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-300 hover:border-red-400 px-3.5 py-1.5 rounded-lg text-xs font-bold transition shadow-sm"
                                            >
                                                Cancel Approved Request
                                            </button>
                                        )}
                                    </div>

                                </div>


                                {/* REQUEST DETAILS */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 text-gray-600 text-sm">

                                    <p>
                                        <strong>Date:</strong><br />
                                        {String(request.request_date).slice(0, 10)}
                                    </p>

                                    <p>
                                        <strong>Time:</strong><br />
                                        {request.start_time} - {request.end_time}
                                    </p>

                                    <p>
                                        <strong>Participants:</strong><br />
                                        {request.participants} Students
                                    </p>

                                    <p>
                                        <strong>Priority:</strong><br />
                                        {request.priority}
                                    </p>

                                </div>

                                {/* HOD REASSIGNMENT PROPOSAL CARD */}
                                {(request.status === "HOD_REASSIGNMENT_PENDING" || request.status === "REASSIGNMENT_PENDING") && (
                                    <div className="mt-5 bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-400 rounded-2xl p-6 shadow-md space-y-4">

                                        <div className="border-b border-amber-200 pb-3">
                                            <h5 className="font-extrabold text-amber-950 text-xl flex items-center gap-2">
                                                <span>⚠️</span> Classroom Reassignment
                                            </h5>
                                            <p className="text-amber-900 text-sm mt-1 leading-relaxed">
                                                Your approved classroom request has been cancelled/reassigned by the HOD because the classroom is required for another activity.
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="bg-white/80 p-4 rounded-xl border border-amber-200">
                                                <p className="text-xs font-bold uppercase text-gray-400 tracking-wider">Original classroom:</p>
                                                <p className="text-lg font-bold text-gray-800 mt-1">
                                                    {request.rooms && request.rooms.length > 0
                                                        ? request.rooms.map(r => `${r.building} ${r.room_number}`).join(", ")
                                                        : "Classroom Allocation"}
                                                </p>
                                            </div>

                                            <div className="bg-white p-4 rounded-xl border-2 border-emerald-500 shadow-sm">
                                                <p className="text-xs font-bold uppercase text-emerald-600 tracking-wider">Suggested alternative:</p>
                                                <p className="text-lg font-bold text-emerald-800 mt-1">
                                                    {request.proposed_rooms && request.proposed_rooms.length > 0
                                                        ? request.proposed_rooms.map(r => `${r.building} ${r.room_number}`).join(", ")
                                                        : `${request.proposed_building || ""} ${request.proposed_room_number || ""}`}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Capacity: {request.proposed_rooms && request.proposed_rooms.length > 0
                                                        ? request.proposed_rooms.reduce((acc, r) => acc + Number(r.capacity || 0), 0)
                                                        : request.proposed_capacity}
                                                </p>
                                            </div>
                                        </div>

                                        <p className="text-sm font-medium text-amber-950 bg-amber-100/70 px-4 py-2 rounded-xl">
                                            The suggested classroom satisfies the required constraints for your activity. Do you accept this alternative?
                                        </p>

                                        <div className="flex flex-wrap gap-4 pt-2">
                                            <button
                                                onClick={() => acceptReassignment(request.request_id)}
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition shadow-md hover:shadow-lg"
                                            >
                                                Approve / Accept
                                            </button>

                                            <button
                                                onClick={() => rejectReassignment(request.request_id)}
                                                className="bg-rose-600 hover:bg-rose-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition shadow-md hover:shadow-lg"
                                            >
                                                Reject
                                            </button>
                                        </div>

                                    </div>
                                )}

                                {/* TEACHER REJECTED NOTICE */}
                                {request.status === "REASSIGNMENT_REJECTED" && (
                                    <div className="mt-5 bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-800 text-sm">
                                        <p className="font-bold">⚠️ Reassignment Rejected</p>
                                        <p className="mt-0.5 text-rose-700 text-xs">
                                            You rejected the suggested alternative classroom. The HOD has been notified and will review your request.
                                        </p>
                                    </div>
                                )}

                                {/* HOD CANCELLATION NOTICE (NO ALTERNATIVE) */}
                                {request.status === "CANCELLED" && (
                                    <div className="mt-5 bg-red-50 border border-red-200 rounded-xl p-5 text-sm space-y-3">
                                        <div className="flex items-center gap-2 text-red-900 font-bold">
                                            <span>🚫</span>
                                            <span>Classroom Request Cancelled</span>
                                        </div>
                                        <p className="text-red-800 text-xs leading-relaxed">
                                            {request.cancellation_reason ||
                                                "Your approved classroom request has been cancelled by the HOD because the classroom is required for another activity. No suitable alternative classroom was available for the requested date/time. Please search for another date/time."}
                                        </p>

                                        {request.cancelled_by_role === "HOD" && (
                                            <div className="flex flex-wrap gap-3 pt-2">
                                                <button
                                                    type="button"
                                                    onClick={() => searchAnotherClassroom(request)}
                                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold text-xs transition shadow-sm"
                                                >
                                                    Search Availability for This Slot
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => chooseAnotherDateTime(request)}
                                                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold text-xs transition shadow-sm"
                                                >
                                                    Choose Another Date/Time
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ALLOCATED ROOMS (FOR APPROVED / REASSIGNMENT_PENDING) */}
                                {request.status !== "CANCELLED" && request.rooms && request.rooms.length > 0 && (
                                    <div className="mt-5">

                                        <h5 className="font-bold text-gray-800 text-base mb-3">
                                            Allocated Classrooms
                                        </h5>

                                        <div className="space-y-2">

                                            {request.rooms.map((room) => (

                                                <div
                                                    key={room.allocation_id || room.classroom_id}
                                                    className="flex justify-between items-center bg-gray-50 border rounded-lg px-4 py-3 text-sm"
                                                >

                                                    <div>
                                                        <span className="font-semibold text-gray-900">
                                                            {room.building} {room.room_number}
                                                        </span>

                                                        <span className="text-gray-500 ml-3">
                                                            {room.room_type}
                                                        </span>
                                                    </div>

                                                    <span className="text-gray-600">
                                                        Capacity: {room.capacity}
                                                    </span>

                                                </div>

                                            ))}

                                        </div>

                                        {/* CAPACITY SUMMARY */}
                                        <div className="mt-4 border-t pt-3">
                                            <div className="grid grid-cols-3 gap-4 text-xs text-gray-600">
                                                <p>
                                                    <strong>Total Rooms:</strong> {request.rooms.length}
                                                </p>
                                                <p>
                                                    <strong>Total Capacity:</strong> {request.rooms.reduce(
                                                        (total, room) => total + Number(room.capacity || 0),
                                                        0
                                                    )}
                                                </p>
                                                <p>
                                                    <strong>Unused Capacity:</strong> {request.rooms.reduce(
                                                        (total, room) => total + Number(room.capacity || 0),
                                                        0
                                                    ) - Number(request.participants || 0)}
                                                </p>
                                            </div>
                                        </div>

                                    </div>
                                )}

                            </div>

                        ))}

                        {/* CONFIRMATION MODAL FOR TEACHER CANCELLATION */}
                        {cancelModalRequest && (
                            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                                <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                                    <div className="flex items-center gap-3 text-red-600">
                                        <span className="text-2xl">⚠️</span>
                                        <h3 className="text-lg font-bold text-gray-900">Cancel Approved Request?</h3>
                                    </div>

                                    <p className="text-gray-600 text-sm leading-relaxed">
                                        Are you sure you want to cancel this approved classroom request?
                                    </p>

                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs space-y-1.5 text-slate-700">
                                        <p><strong>Activity:</strong> {cancelModalRequest.activity_type}</p>
                                        <p><strong>Date:</strong> {String(cancelModalRequest.request_date).slice(0, 10)}</p>
                                        <p><strong>Timing:</strong> {cancelModalRequest.start_time} - {cancelModalRequest.end_time}</p>
                                        <p><strong>Allocated Classroom(s):</strong> {cancelModalRequest.rooms.map(r => `${r.building} ${r.room_number}`).join(", ")}</p>
                                    </div>

                                    <p className="text-xs text-red-600 font-semibold bg-red-50 p-3 rounded-lg">
                                        All allocated classrooms will be immediately released and made available for other activities.
                                    </p>

                                    <div className="flex justify-end gap-3 pt-2">
                                        <button
                                            onClick={() => setCancelModalRequest(null)}
                                            disabled={isCancelling}
                                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                                        >
                                            Keep Allocation
                                        </button>
                                        <button
                                            onClick={() => cancelApprovedRequest(cancelModalRequest.request_id)}
                                            disabled={isCancelling}
                                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                                        >
                                            {isCancelling ? "Cancelling..." : "Yes, Cancel Approved Request"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                )}
                </main>

            </div>
        );
    }


    // LOGIN PAGE
    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">

            <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">

                <h1 className="text-3xl font-bold text-center mb-2">
                    Classroom Allocation
                </h1>

                <p className="text-gray-500 text-center mb-6">
                    Login to continue
                </p>

                <form onSubmit={handleLogin} className="space-y-4">

                    <div>

                        <label className="block mb-1 font-medium">
                            Email
                        </label>

                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Enter your email"
                            className="w-full border rounded-lg px-4 py-2"
                            required
                        />

                    </div>


                    <div>

                        <label className="block mb-1 font-medium">
                            Password
                        </label>

                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            className="w-full border rounded-lg px-4 py-2"
                            required
                        />

                    </div>


                    <button
                        type="submit"
                        className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700"
                    >
                        Login
                    </button>

                </form>


                {message && (
                    <p className="text-red-500 text-center mt-4">
                        {message}
                    </p>
                )}

            </div>

        </div>
    );
}

export default App;