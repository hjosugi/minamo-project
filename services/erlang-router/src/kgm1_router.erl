-module(kgm1_router).
-behaviour(gen_server).

-export([start_link/0, subscribe/3, unsubscribe/2, publish/2, room_size/1]).
-export([init/1, handle_call/3, handle_cast/2, handle_info/2, terminate/2, code_change/3]).

start_link() ->
    gen_server:start_link({local, ?MODULE}, ?MODULE, [], []).

publish(RoomId, Frame) ->
    gen_server:cast(?MODULE, {publish, RoomId, Frame}).

subscribe(RoomId, SubscriberId, Pid) when is_pid(Pid) ->
    gen_server:call(?MODULE, {subscribe, RoomId, SubscriberId, Pid}).

unsubscribe(RoomId, SubscriberId) ->
    gen_server:call(?MODULE, {unsubscribe, RoomId, SubscriberId}).

room_size(RoomId) ->
    gen_server:call(?MODULE, {room_size, RoomId}).

init([]) ->
    {ok, #{rooms => #{}}}.

handle_call({subscribe, RoomId, SubscriberId, Pid}, _From, State) ->
    Rooms0 = maps:get(rooms, State),
    Room0 = maps:get(RoomId, Rooms0, #{}),
    Room1 = maps:put(SubscriberId, #{pid => Pid, latest => undefined, dropped => 0}, Room0),
    Rooms1 = maps:put(RoomId, Room1, Rooms0),
    {reply, ok, State#{rooms => Rooms1}};
handle_call({unsubscribe, RoomId, SubscriberId}, _From, State) ->
    Rooms0 = maps:get(rooms, State),
    Room0 = maps:get(RoomId, Rooms0, #{}),
    Room1 = maps:remove(SubscriberId, Room0),
    Rooms1 = case maps:size(Room1) of
        0 -> maps:remove(RoomId, Rooms0);
        _ -> maps:put(RoomId, Room1, Rooms0)
    end,
    {reply, ok, State#{rooms => Rooms1}};
handle_call({room_size, RoomId}, _From, State) ->
    Rooms = maps:get(rooms, State),
    {reply, maps:size(maps:get(RoomId, Rooms, #{})), State};
handle_call(_Request, _From, State) ->
    {reply, ok, State}.

handle_cast({publish, RoomId, Frame}, State) ->
    Rooms0 = maps:get(rooms, State),
    Room0 = maps:get(RoomId, Rooms0, #{}),
    Room1 = maps:map(fun(_SubscriberId, Sub0) ->
        Pid = maps:get(pid, Sub0),
        Dropped0 = maps:get(dropped, Sub0, 0),
        Dropped1 = case maps:get(latest, Sub0, undefined) of
            undefined -> Dropped0;
            _ -> Dropped0 + 1
        end,
        Pid ! {kgm1_frame, RoomId, Frame},
        Sub0#{latest => Frame, dropped => Dropped1}
    end, Room0),
    Rooms1 = maps:put(RoomId, Room1, Rooms0),
    {noreply, State#{rooms => Rooms1}};
handle_cast(_Msg, State) ->
    {noreply, State}.

handle_info(_Info, State) ->
    {noreply, State}.

terminate(_Reason, _State) ->
    ok.

code_change(_OldVsn, State, _Extra) ->
    {ok, State}.
