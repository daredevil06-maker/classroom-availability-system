import { useEffect, useState } from "react";

function HodDashboard({ user, onLogout, embedded = false }) {
    const [activeTab, setActiveTab] = useState("allocations");
    const [allocations, setAllocations] = useState([]);
    const [reassignments, setReassignments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedDepartment, setSelectedDepartment] = useState("");

    // Reassignment Modal State
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [searchingAlternative, setSearchingAlternative] = useState(false);
    const [alternativeResult, setAlternativeResult] = useState(null);
    const [confirmHodCancel, setConfirmHodCancel] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    // Availability Check State
    const [checkDate, setCheckDate] = useState("");
    const [checkStartTime, setCheckStartTime] = useState("");
    const [checkEndTime, setCheckEndTime] = useState("");
    const [availableRooms, setAvailableRooms] = useState([]);
    const [checkingAvailability, setCheckingAvailability] = useState(false);

    // Fetch allocations
    const loadAllocations = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const response = await fetch("http://localhost:5000/api/requests/all-allocations", {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            if (response.ok) {
                setAllocations(data.allocations || []);
            } else {
                setMessage(data.message || "Failed to load allocations");
            }
        } catch (error) {
            console.error(error);
            setMessage("Unable to connect to server");
        } finally {
            setLoading(false);
        }
    };

    // Fetch reassignments history
    const loadReassignments = async () => {
        try {
            const token = localStorage.getItem("token");
            const response = await fetch("http://localhost:5000/api/requests/reassignments-history", {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            if (response.ok) {
                setReassignments(data.reassignments || []);
            }
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        loadAllocations();
        loadReassignments();
        const interval = setInterval(() => {
            loadReassignments();
        }, 10000);
        return () => clearInterval(interval);
    }, []);

    // Open Reassignment Modal and search alternative
    const openReassignModal = async (request) => {
        setSelectedRequest(request);
        setAlternativeResult(null);
        setConfirmHodCancel(false);
        setSearchingAlternative(true);
        setMessage("");

        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`http://localhost:5000/api/requests/${request.request_id}/find-alternative`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            setAlternativeResult(data);
        } catch (error) {
            console.error(error);
            setMessage("Error finding alternative classroom");
        } finally {
            setSearchingAlternative(false);
        }
    };

    // Send Suggestion to Teacher
    const sendSuggestion = async () => {
        if (!selectedRequest || !alternativeResult || !alternativeResult.rooms) return;

        setActionLoading(true);
        try {
            const token = localStorage.getItem("token");
            const classroomIds = alternativeResult.rooms.map(r => r.classroom_id);
            const response = await fetch(`http://localhost:5000/api/requests/${selectedRequest.request_id}/suggest-alternative`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    alternative_classroom_ids: classroomIds,
                    message: "Your approved classroom request has been cancelled/reassigned by the HOD because the classroom is required for another activity."
                })
            });

            const data = await response.json();
            if (response.ok) {
                setMessage("Alternative classroom suggestion sent to teacher successfully.");
                setSelectedRequest(null);
                setAlternativeResult(null);
                loadAllocations();
                loadReassignments();
            } else {
                setMessage(data.message || "Failed to send suggestion");
            }
        } catch (error) {
            console.error(error);
            setMessage("Error sending alternative suggestion");
        } finally {
            setActionLoading(false);
        }
    };

    // HOD Cancel without alternative (or confirm cancellation)
    const executeHodCancel = async () => {
        if (!selectedRequest) return;

        setActionLoading(true);
        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`http://localhost:5000/api/requests/${selectedRequest.request_id}/hod-cancel`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    reason: "Your approved classroom request has been cancelled by the HOD because the classroom is required for another activity. No suitable alternative classroom was available for the requested date/time. Please search for another date/time."
                })
            });

            const data = await response.json();
            if (response.ok) {
                setMessage("Approved request cancelled and all classrooms released successfully.");
                setSelectedRequest(null);
                setAlternativeResult(null);
                setConfirmHodCancel(false);
                loadAllocations();
                loadReassignments();
            } else {
                setMessage(data.message || "Failed to cancel request");
            }
        } catch (error) {
            console.error(error);
            setMessage("Error cancelling request");
        } finally {
            setActionLoading(false);
        }
    };

    // Check Availability
    const checkAvailability = async () => {
        if (!checkDate || !checkStartTime || !checkEndTime) {
            setMessage("Please select date, start time, and end time");
            return;
        }

        setCheckingAvailability(true);
        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`http://localhost:5000/api/classrooms/available?date=${checkDate}&start_time=${checkStartTime}&end_time=${checkEndTime}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            if (response.ok) {
                setAvailableRooms(data.available_classrooms || []);
            } else {
                setMessage(data.message || "Failed to fetch availability");
            }
        } catch (error) {
            console.error(error);
            setMessage("Error checking availability");
        } finally {
            setCheckingAvailability(false);
        }
    };

    // Filter allocations
    const filteredAllocations = allocations.filter(item => {
        const matchesSearch =
            (item.teacher_name && item.teacher_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (item.activity_type && item.activity_type.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (item.request_id && String(item.request_id).includes(searchQuery));

        const matchesDept = !selectedDepartment || item.department === selectedDepartment;
        return matchesSearch && matchesDept;
    });

    const activeAllocationsCount = allocations.filter(a => a.status === "APPROVED").length;
    const pendingReassignmentsCount = allocations.filter(a => a.status === "HOD_REASSIGNMENT_PENDING").length;
    const acceptedCount = reassignments.filter(r => r.teacher_response === "ACCEPTED").length;
    const rejectedCount = reassignments.filter(r => r.teacher_response === "REJECTED").length;

    return (
        <div className={embedded ? "space-y-6" : "min-h-screen bg-slate-50 text-slate-800"}>
            {/* TOP NAVBAR */}
            {!embedded && (
                <header className="bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-800 text-white shadow-lg sticky top-0 z-40">
                    <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap justify-between items-center gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center font-black text-xl shadow-inner">
                                CA
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight">Smart Classroom Allocation</h1>
                                <p className="text-xs text-blue-200">Head of Department (HOD) Portal</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="bg-white/10 backdrop-blur px-4 py-1.5 rounded-full border border-white/20 text-sm">
                                <span className="font-semibold">{user.name}</span>
                                <span className="mx-2 opacity-60">|</span>
                                <span className="text-blue-200 uppercase tracking-wider text-xs font-bold">HOD</span>
                            </div>
                            <button
                                onClick={onLogout}
                                className="bg-white text-blue-700 hover:bg-blue-50 px-4 py-2 rounded-lg font-semibold text-sm transition shadow-sm"
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                </header>
            )}

            <main className={embedded ? "space-y-8" : "max-w-7xl mx-auto p-6 md:p-8 space-y-8"}>
                {/* HERO STATS OVERVIEW */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <p className="text-xs uppercase font-bold text-slate-400 tracking-wider">Active Allocations</p>
                        <p className="text-3xl font-extrabold text-blue-600 mt-1">{activeAllocationsCount}</p>
                        <p className="text-xs text-slate-500 mt-1">Operational classroom bookings</p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <p className="text-xs uppercase font-bold text-slate-400 tracking-wider">Pending Reassignments</p>
                        <p className="text-3xl font-extrabold text-amber-500 mt-1">{pendingReassignmentsCount}</p>
                        <p className="text-xs text-slate-500 mt-1">Awaiting teacher decision</p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <p className="text-xs uppercase font-bold text-slate-400 tracking-wider">Teacher Accepted</p>
                        <p className="text-3xl font-extrabold text-emerald-600 mt-1">{acceptedCount}</p>
                        <p className="text-xs text-slate-500 mt-1">Reassigned successfully</p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <p className="text-xs uppercase font-bold text-slate-400 tracking-wider">Teacher Rejected</p>
                        <p className="text-3xl font-extrabold text-rose-600 mt-1">{rejectedCount}</p>
                        <p className="text-xs text-slate-500 mt-1">Declined alternatives</p>
                    </div>
                </div>

                {/* GLOBAL MESSAGE BANNER */}
                {message && (
                    <div className="bg-blue-50 border border-blue-200 text-blue-800 px-5 py-3.5 rounded-xl text-sm font-medium flex justify-between items-center">
                        <span>{message}</span>
                        <button onClick={() => setMessage("")} className="text-blue-500 hover:text-blue-800 text-base">✕</button>
                    </div>
                )}

                {/* NAVIGATION TABS */}
                <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
                    <button
                        onClick={() => { setActiveTab("allocations"); loadAllocations(); }}
                        className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition ${
                            activeTab === "allocations"
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-slate-600 hover:bg-slate-200/60"
                        }`}
                    >
                        Faculty Allocations & Reassignments
                    </button>
                    <button
                        onClick={() => { setActiveTab("responses"); loadReassignments(); }}
                        className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition relative ${
                            activeTab === "responses"
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-slate-600 hover:bg-slate-200/60"
                        }`}
                    >
                        Reassignment Responses & Tracking
                        {rejectedCount > 0 && (
                            <span className="ml-2 bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                                {rejectedCount}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab("availability")}
                        className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition ${
                            activeTab === "availability"
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-slate-600 hover:bg-slate-200/60"
                        }`}
                    >
                        Classroom Availability Check
                    </button>
                </div>

                {/* TAB 1: ALLOCATIONS & REASSIGNMENT */}
                {activeTab === "allocations" && (
                    <div className="space-y-6">
                        {/* SEARCH & FILTERS */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-center justify-between">
                            <div className="flex-1 min-w-[240px]">
                                <input
                                    type="text"
                                    placeholder="Search by teacher name, activity, or request ID..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                <select
                                    value={selectedDepartment}
                                    onChange={(e) => setSelectedDepartment(e.target.value)}
                                    className="px-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                >
                                    <option value="">All Departments</option>
                                    <option value="Computer Science">Computer Science</option>
                                    <option value="Information Technology">Information Technology</option>
                                </select>
                                <button
                                    onClick={loadAllocations}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition"
                                >
                                    {loading ? "Refreshing..." : "Refresh"}
                                </button>
                            </div>
                        </div>

                        {/* ALLOCATIONS LIST */}
                        {filteredAllocations.length === 0 && !loading && (
                            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
                                <p className="text-slate-500 font-medium">No faculty allocations found matching criteria.</p>
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-4">
                            {filteredAllocations.map((item) => (
                                <div
                                    key={item.request_id}
                                    className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-slate-300 transition"
                                >
                                    <div className="flex flex-wrap justify-between items-start gap-4 pb-4 border-b border-slate-100">
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-lg font-bold text-slate-900">{item.activity_type}</h3>
                                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                                    item.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" :
                                                    item.status === "HOD_REASSIGNMENT_PENDING" ? "bg-amber-100 text-amber-700 animate-pulse" :
                                                    item.status === "REASSIGNMENT_REJECTED" ? "bg-rose-100 text-rose-700" :
                                                    item.status === "CANCELLED" ? "bg-slate-100 text-slate-600" :
                                                    "bg-blue-100 text-blue-700"
                                                }`}>
                                                    {item.status === "HOD_REASSIGNMENT_PENDING" ? "REASSIGNMENT SUGGESTED" :
                                                     item.status === "REASSIGNMENT_REJECTED" ? "REJECTED BY TEACHER" :
                                                     item.status}
                                                </span>
                                                <span className="text-xs font-semibold bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                                                    Priority: {item.priority}
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-500 mt-1">
                                                Teacher: <span className="font-semibold text-slate-700">{item.teacher_name}</span> ({item.department || "Faculty"} - {item.employee_id || "ID"}) • Request #{item.request_id}
                                            </p>
                                        </div>

                                        {/* ACTION BUTTONS */}
                                        <div className="flex items-center gap-2">
                                            {item.status === "APPROVED" && (
                                                <button
                                                    onClick={() => openReassignModal(item)}
                                                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition shadow-sm flex items-center gap-2"
                                                >
                                                    <span>Cancel / Reassign Approved Request</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* ALLOCATION DETAILS GRID */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 text-sm">
                                        <div>
                                            <p className="text-xs font-semibold text-slate-400">Date</p>
                                            <p className="font-medium text-slate-700 mt-0.5">{String(item.request_date).slice(0, 10)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-slate-400">Timing</p>
                                            <p className="font-medium text-slate-700 mt-0.5">{item.start_time} - {item.end_time}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-slate-400">Participants</p>
                                            <p className="font-medium text-slate-700 mt-0.5">{item.participants} Students</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-slate-400">Reason</p>
                                            <p className="font-medium text-slate-700 mt-0.5 truncate">{item.reason || "Standard Academic Request"}</p>
                                        </div>
                                    </div>

                                    {/* CURRENT ROOMS */}
                                    {item.allocated_rooms && item.allocated_rooms.length > 0 && (
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mt-2">
                                            <p className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">
                                                Allocated Classroom(s):
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {item.allocated_rooms.map((room) => (
                                                    <div
                                                        key={room.classroom_id}
                                                        className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-2"
                                                    >
                                                        <span className="text-blue-600 font-bold">{room.building} {room.room_number}</span>
                                                        <span className="text-slate-400">•</span>
                                                        <span>Cap: {room.capacity}</span>
                                                        {room.computers && <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px]">Computers</span>}
                                                        {room.ac && <span className="bg-cyan-50 text-cyan-600 px-1.5 py-0.5 rounded text-[10px]">AC</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* REASSIGNMENT STATUS BANNER */}
                                    {item.status === "HOD_REASSIGNMENT_PENDING" && item.proposed_rooms && (
                                        <div className="mt-3 bg-amber-50 border border-amber-200 p-3.5 rounded-xl text-xs text-amber-800 flex justify-between items-center">
                                            <div>
                                                <span className="font-bold">Suggested Alternative: </span>
                                                {item.proposed_rooms.map(r => `${r.building} ${r.room_number} (Cap: ${r.capacity})`).join(", ")}
                                                <span className="ml-2 font-normal text-amber-700">• Awaiting Teacher Approval</span>
                                            </div>
                                            <span className="font-semibold bg-amber-200/60 px-2 py-0.5 rounded">Pending Teacher</span>
                                        </div>
                                    )}

                                    {/* CANCELLED STATUS AUDIT */}
                                    {item.status === "CANCELLED" && (
                                        <div className="mt-3 bg-slate-100 p-3 rounded-xl text-xs text-slate-600 flex justify-between items-center">
                                            <span>
                                                <strong>Cancelled by:</strong> {item.cancelled_by_role || "SYSTEM"} • {item.cancellation_reason || "Request cancelled."}
                                            </span>
                                            <span className="text-slate-400">Classrooms Released</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* TAB 2: REASSIGNMENTS & TEACHER RESPONSES */}
                {activeTab === "responses" && (
                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-xl font-bold text-slate-900">Reassignment Responses & Audit Log</h3>
                                    <p className="text-sm text-slate-500 mt-0.5">Real-time status of all alternative classroom suggestions sent to teachers</p>
                                </div>
                                <button
                                    onClick={loadReassignments}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition"
                                >
                                    Refresh Responses
                                </button>
                            </div>

                            {/* RECENT RESPONSE ALERTS */}
                            <div className="space-y-3 mb-6">
                                {reassignments.filter(r => r.teacher_response === "ACCEPTED").slice(0, 2).map(r => (
                                    <div key={`acc-${r.request_id}`} className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-sm flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">✅</span>
                                            <span>
                                                <strong>Teacher {r.teacher_name}</strong> accepted the suggested alternative classroom ({r.suggested_classrooms}) for {r.activity_type}.
                                            </span>
                                        </div>
                                        <span className="text-xs text-emerald-600 font-semibold">{r.teacher_response_at ? new Date(r.teacher_response_at).toLocaleTimeString() : ""}</span>
                                    </div>
                                ))}

                                {reassignments.filter(r => r.teacher_response === "REJECTED").slice(0, 2).map(r => (
                                    <div key={`rej-${r.request_id}`} className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-sm flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">⚠️</span>
                                            <span>
                                                <strong>Teacher {r.teacher_name}</strong> rejected the suggested classroom ({r.suggested_classrooms}) for {r.activity_type}.
                                            </span>
                                        </div>
                                        <span className="text-xs text-rose-600 font-semibold">{r.teacher_response_at ? new Date(r.teacher_response_at).toLocaleTimeString() : ""}</span>
                                    </div>
                                ))}
                            </div>

                            {/* AUDIT TABLE */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-xs font-bold text-slate-400 uppercase tracking-wider">
                                            <th className="py-3 px-4">Teacher Name</th>
                                            <th className="py-3 px-4">Activity</th>
                                            <th className="py-3 px-4">Date & Time</th>
                                            <th className="py-3 px-4">Original Classroom</th>
                                            <th className="py-3 px-4">Suggested Alternative</th>
                                            <th className="py-3 px-4">Teacher Response</th>
                                            <th className="py-3 px-4">Response Time</th>
                                            <th className="py-3 px-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {reassignments.length === 0 ? (
                                            <tr>
                                                <td colSpan="8" className="text-center py-8 text-slate-400">
                                                    No reassignment actions recorded yet.
                                                </td>
                                            </tr>
                                        ) : (
                                            reassignments.map((item) => (
                                                <tr key={item.request_id} className="hover:bg-slate-50/60 transition">
                                                    <td className="py-3.5 px-4 font-semibold text-slate-900">{item.teacher_name}</td>
                                                    <td className="py-3.5 px-4 text-slate-700">{item.activity_type}</td>
                                                    <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                                                        {item.request_date} • {item.start_time} - {item.end_time}
                                                    </td>
                                                    <td className="py-3.5 px-4 font-medium text-slate-700">{item.current_classrooms}</td>
                                                    <td className="py-3.5 px-4 font-medium text-indigo-700">{item.suggested_classrooms}</td>
                                                    <td className="py-3.5 px-4">
                                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                                            item.teacher_response === "ACCEPTED" ? "bg-emerald-100 text-emerald-800" :
                                                            item.teacher_response === "REJECTED" ? "bg-rose-100 text-rose-800" :
                                                            item.status === "CANCELLED" ? "bg-slate-100 text-slate-600" :
                                                            "bg-amber-100 text-amber-800 animate-pulse"
                                                        }`}>
                                                            {item.teacher_response || (item.status === "CANCELLED" ? "CANCELLED" : "AWAITING TEACHER")}
                                                        </span>
                                                    </td>
                                                    <td className="py-3.5 px-4 text-slate-400 text-xs">
                                                        {item.teacher_response_at
                                                            ? new Date(item.teacher_response_at).toLocaleString()
                                                            : item.cancelled_at
                                                            ? new Date(item.cancelled_at).toLocaleString()
                                                            : "Pending"}
                                                    </td>
                                                    <td className="py-3.5 px-4 text-right text-xs text-slate-400 font-medium">
                                                        —
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 3: AVAILABILITY CHECK */}
                {activeTab === "availability" && (
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                        <div>
                            <h3 className="text-xl font-bold text-slate-900">Check Live Classroom Availability</h3>
                            <p className="text-sm text-slate-500 mt-0.5">Directly query unbooked classrooms considering timetable and active allocations</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Date</label>
                                <input
                                    type="date"
                                    value={checkDate}
                                    onChange={(e) => setCheckDate(e.target.value)}
                                    className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Start Time</label>
                                <input
                                    type="time"
                                    value={checkStartTime}
                                    onChange={(e) => setCheckStartTime(e.target.value)}
                                    className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">End Time</label>
                                <input
                                    type="time"
                                    value={checkEndTime}
                                    onChange={(e) => setCheckEndTime(e.target.value)}
                                    className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        <button
                            onClick={checkAvailability}
                            disabled={checkingAvailability}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition shadow-sm"
                        >
                            {checkingAvailability ? "Checking..." : "Search Available Classrooms"}
                        </button>

                        {availableRooms.length > 0 && (
                            <div className="pt-6 border-t border-slate-100">
                                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">
                                    Available Classrooms ({availableRooms.length})
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {availableRooms.map((room) => (
                                        <div
                                            key={room.classroom_id}
                                            className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 flex justify-between items-center"
                                        >
                                            <div>
                                                <h5 className="font-bold text-slate-900">{room.building} {room.room_number}</h5>
                                                <p className="text-xs text-slate-500 mt-0.5">{room.room_type} • Capacity: {room.capacity}</p>
                                            </div>
                                            <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-1 rounded-full">
                                                FREE
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* REASSIGNMENT & ALTERNATIVE SEARCH MODAL */}
            {selectedRequest && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-2xl w-full p-6 md:p-8 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-6">
                        <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900">Classroom Reassignment / Cancellation</h3>
                                <p className="text-xs text-slate-500 mt-1">
                                    Automated Alternative Search using Core Allocation Engine
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedRequest(null)}
                                className="text-slate-400 hover:text-slate-700 text-xl font-bold p-1"
                            >
                                ✕
                            </button>
                        </div>

                        {/* REQUEST CONTEXT */}
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs text-slate-600">
                            <div>
                                <span className="font-semibold text-slate-400">Teacher:</span>
                                <p className="font-bold text-slate-800 text-sm">{selectedRequest.teacher_name}</p>
                            </div>
                            <div>
                                <span className="font-semibold text-slate-400">Activity:</span>
                                <p className="font-bold text-slate-800 text-sm">{selectedRequest.activity_type}</p>
                            </div>
                            <div>
                                <span className="font-semibold text-slate-400">Timing:</span>
                                <p className="font-bold text-slate-800 text-sm">{selectedRequest.request_date} ({selectedRequest.start_time} - {selectedRequest.end_time})</p>
                            </div>
                            <div>
                                <span className="font-semibold text-slate-400">Participants:</span>
                                <p className="font-bold text-slate-800 text-sm">{selectedRequest.participants} Students</p>
                            </div>
                            <div>
                                <span className="font-semibold text-slate-400">Original Classroom:</span>
                                <p className="font-bold text-indigo-700 text-sm">
                                    {selectedRequest.allocated_rooms && selectedRequest.allocated_rooms.length > 0
                                        ? selectedRequest.allocated_rooms.map(r => `${r.building} ${r.room_number}`).join(", ")
                                        : "N/A"}
                                </p>
                            </div>
                        </div>

                        {/* SEARCH PROGRESS / RESULTS */}
                        {searchingAlternative ? (
                            <div className="py-12 text-center space-y-3">
                                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                                <p className="text-sm font-semibold text-slate-700">Searching suitable alternative classroom...</p>
                                <p className="text-xs text-slate-400">Evaluating capacity, facilities, timetable non-collision, and proximity</p>
                            </div>
                        ) : alternativeResult ? (
                            <div className="space-y-4">
                                {alternativeResult.found ? (
                                    <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl space-y-3">
                                        <div className="flex items-center gap-2 text-emerald-800 font-bold">
                                            <span className="text-lg">✅</span>
                                            <span>Alternative classroom found.</span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                                            <div className="bg-white p-3 rounded-xl border border-emerald-200">
                                                <p className="text-xs text-slate-400 font-semibold uppercase">Original Classroom</p>
                                                <p className="text-base font-bold text-slate-800 mt-1">
                                                    {alternativeResult.original_rooms && alternativeResult.original_rooms.length > 0
                                                        ? alternativeResult.original_rooms.map(r => `${r.building} ${r.room_number}`).join(", ")
                                                        : "None"}
                                                </p>
                                            </div>

                                            <div className="bg-white p-3 rounded-xl border border-emerald-300 shadow-sm">
                                                <p className="text-xs text-emerald-600 font-bold uppercase">Suggested Alternative</p>
                                                <p className="text-base font-bold text-emerald-700 mt-1">
                                                    {alternativeResult.rooms.map(r => `${r.building} ${r.room_number}`).join(", ")}
                                                </p>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    Combined Capacity: {alternativeResult.totalCapacity} ({alternativeResult.unusedCapacity} unused)
                                                </p>
                                            </div>
                                        </div>

                                        <p className="text-xs text-emerald-800 bg-emerald-100/60 p-3 rounded-xl leading-relaxed">
                                            {alternativeResult.explanation}
                                        </p>

                                        <div className="pt-2 flex flex-wrap gap-3 justify-end">
                                            <button
                                                onClick={sendSuggestion}
                                                disabled={actionLoading}
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition shadow-sm"
                                            >
                                                {actionLoading ? "Sending..." : "Send Suggestion to Teacher"}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl space-y-4">
                                        <div className="flex items-center gap-2 text-amber-800 font-bold">
                                            <span className="text-lg">⚠️</span>
                                            <span>No suitable alternative classroom is available for this date and time.</span>
                                        </div>
                                        <p className="text-xs text-amber-700 leading-relaxed">
                                            All other classrooms are occupied, violate timetable schedules, or do not satisfy mandatory facilities/capacity for this activity duration.
                                        </p>

                                        {!confirmHodCancel ? (
                                            <button
                                                onClick={() => setConfirmHodCancel(true)}
                                                className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition shadow-sm"
                                            >
                                                Cancel Approved Request Without Alternative
                                            </button>
                                        ) : (
                                            <div className="bg-white p-4 rounded-xl border border-rose-300 space-y-3">
                                                <p className="text-xs font-bold text-rose-700">
                                                    Are you sure you want to cancel this approved request? All allocated classrooms will be immediately released, and Teacher {selectedRequest.teacher_name} will be notified to search for another timing.
                                                </p>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={executeHodCancel}
                                                        disabled={actionLoading}
                                                        className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg font-bold text-xs transition"
                                                    >
                                                        {actionLoading ? "Cancelling..." : "Confirm Immediate Cancellation"}
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmHodCancel(false)}
                                                        className="bg-slate-200 text-slate-700 px-3 py-2 rounded-lg font-semibold text-xs"
                                                    >
                                                        Back
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );
}

export default HodDashboard;
